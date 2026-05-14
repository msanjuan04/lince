'use server';

import { revalidatePath } from 'next/cache';
import { prisma, pulseReportsRepo, weekStartUTC } from '@lince/db';
import {
  generatePulseReport,
  loadPulseData,
  sendPulseReportToTelegram,
  type PulseReaderRole,
} from '@lince/ai';
import { TelegramClient, getTelegramConfigFromEnv } from '@lince/notifier';
import { DEMO_AGENCY_ID } from '@/lib/data/mocks/agency';

export interface GenerateReportResult {
  ok: boolean;
  reportId?: string;
  costEur?: number;
  tokensIn?: number;
  tokensOut?: number;
  dryRun: boolean;
  error?: string;
}

/**
 * Genera el informe semanal Pulse para la agency actual.
 *
 * - Si `ANTHROPIC_API_KEY` no está → dry run, persiste un report con
 *   `dryRun=true` y narrative placeholder (útil para probar UI sin gastar
 *   tokens).
 * - Si sí está → llama a Claude, persiste el markdown y los counters de uso.
 */
export async function generatePulseReportAction(input: {
  readerRole?: PulseReaderRole;
}): Promise<GenerateReportResult> {
  const readerRole = input.readerRole ?? 'inversor_directo';
  const agencyId = DEMO_AGENCY_ID;

  // 1) Cargar el dataset (mismo en dry-run y en real)
  const data = await loadPulseData({
    readerRole,
    topN: 10,
    weekEndDate: new Date(),
  }).catch((err) => {
    console.error('[generatePulseReportAction] loadPulseData falló:', err);
    return null;
  });

  if (!data) {
    return { ok: false, dryRun: true, error: 'No se pudo cargar el dataset de propiedades.' };
  }

  const inventorySnapshot = {
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
    readerRole: data.readerRole,
    propertyCount: data.properties.length,
    zoneCount: data.zoneStats.length,
    bucketCounts: {
      auction: data.properties.filter((p) => p.isAuction).length,
      bankOwned: data.properties.filter((p) => p.isBankOwned && !p.isAuction).length,
      portal: data.properties.filter((p) => !p.isAuction && !p.isBankOwned).length,
      needsReform: data.properties.filter((p) => p.condition === 'needs_reform').length,
      withRedFlags: data.properties.filter((p) => (p.redFlags?.length ?? 0) > 0).length,
    },
  };

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    // Dry run: persistimos sin llamar a Claude.
    const placeholder = buildDryRunNarrative(data);
    const report = await pulseReportsRepo.upsertPulseReport({
      agencyId,
      weekOf: weekStartUTC(new Date()),
      narrative: placeholder,
      topOpportunities: data.properties.slice(0, 5).map((p) => ({
        propertyId: p.id,
        address: p.address,
        city: p.city,
        postalCode: p.postalCode,
        price: p.price,
        pricePerM2: p.pricePerM2,
        zoneAvgPricePerM2: p.zoneAvgPricePerM2,
        opportunityScore: p.opportunityScore,
        bucket: p.isAuction ? 'auction' : p.isBankOwned ? 'bank_owned' : 'portal',
      })),
      inventorySnapshot,
      modelId: 'dry-run',
      promptVersion: 'v1',
      tokensIn: null,
      tokensOut: null,
      costEur: null,
      dryRun: true,
    });
    revalidatePath('/informe');
    return { ok: true, reportId: report.id, dryRun: true };
  }

  // 2) Llamar a Claude real
  try {
    const result = await generatePulseReport(data, { apiKey, model: 'claude-opus-4-7' });

    // Coste aproximado (Opus 4.7 ~ $15/1M input, $75/1M output, asumir EUR≈USD)
    const inputCost = (result.usage.inputTokens * 15) / 1_000_000;
    const outputCost = (result.usage.outputTokens * 75) / 1_000_000;
    const cacheReadCost = (result.usage.cacheReadInputTokens * 1.5) / 1_000_000; // 10% del input cost
    const costEur = +(inputCost + outputCost + cacheReadCost).toFixed(4);

    const report = await pulseReportsRepo.upsertPulseReport({
      agencyId,
      weekOf: weekStartUTC(new Date()),
      narrative: result.markdown,
      topOpportunities: data.properties.slice(0, 5).map((p) => ({
        propertyId: p.id,
        address: p.address,
        city: p.city,
        postalCode: p.postalCode,
        price: p.price,
        pricePerM2: p.pricePerM2,
        zoneAvgPricePerM2: p.zoneAvgPricePerM2,
        opportunityScore: p.opportunityScore,
        bucket: p.isAuction ? 'auction' : p.isBankOwned ? 'bank_owned' : 'portal',
      })),
      inventorySnapshot,
      modelId: result.model,
      promptVersion: 'v1',
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costEur,
      dryRun: false,
    });
    revalidatePath('/informe');
    return {
      ok: true,
      reportId: report.id,
      costEur,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      dryRun: false,
    };
  } catch (err) {
    console.error('[generatePulseReportAction] Claude llamada falló:', err);
    return {
      ok: false,
      dryRun: false,
      error: err instanceof Error ? err.message : 'Error desconocido llamando a Claude',
    };
  }
}

// ============================================================================
// Envío de un informe ya persistido a uno o varios chats de Telegram.
// ============================================================================

export interface TelegramRecipientSuggestion {
  chatId: string;
  /** Etiqueta legible para la UI. Si no hay rol asociado, fallback a chatId. */
  label: string;
  role?: PulseReaderRole;
}

export interface ListTelegramRecipientsResult {
  ok: boolean;
  configured: boolean;
  recipients: TelegramRecipientSuggestion[];
  error?: string;
}

/**
 * Lee los chats configurados en env (`TELEGRAM_PULSE_RECIPIENTS` con rol, o
 * `TELEGRAM_CHAT_IDS` como fallback simple). La UI los muestra como check-list
 * para que Marc elija a cuáles mandar el informe sin escribir el ID a mano.
 */
export async function listTelegramRecipientsAction(): Promise<ListTelegramRecipientsResult> {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    return {
      ok: false,
      configured: false,
      recipients: [],
      error: 'TELEGRAM_BOT_TOKEN no configurado',
    };
  }

  const detailed = process.env['TELEGRAM_PULSE_RECIPIENTS']?.trim();
  if (detailed) {
    const parsed = parseDetailedRecipients(detailed);
    return { ok: true, configured: true, recipients: parsed };
  }

  const simple = process.env['TELEGRAM_CHAT_IDS']?.trim();
  if (simple) {
    return {
      ok: true,
      configured: true,
      recipients: simple
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((chatId) => ({ chatId, label: chatId })),
    };
  }

  return { ok: true, configured: false, recipients: [] };
}

function parseDetailedRecipients(value: string): TelegramRecipientSuggestion[] {
  if (value.startsWith('[')) {
    try {
      const arr = JSON.parse(value) as Array<{
        chatId: string | number;
        role?: string;
        label?: string;
      }>;
      return arr.map((r) => ({
        chatId: String(r.chatId),
        label: r.label ?? `${r.chatId}${r.role ? ` (${r.role})` : ''}`,
        role: r.role && isReaderRole(r.role) ? r.role : undefined,
      }));
    } catch {
      return [];
    }
  }
  // CSV: chatId:role,chatId:role
  const out: TelegramRecipientSuggestion[] = [];
  for (const pair of value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [chatId, role] = pair.split(':');
    if (!chatId) continue;
    const validRole = role && isReaderRole(role) ? role : undefined;
    const item: TelegramRecipientSuggestion = {
      chatId: chatId.trim(),
      label: `${chatId.trim()}${validRole ? ` (${validRole})` : ''}`,
    };
    if (validRole) item.role = validRole;
    out.push(item);
  }
  return out;
}

function isReaderRole(s: string): s is PulseReaderRole {
  return (
    s === 'inmobiliaria' || s === 'buying_agent' || s === 'inversor_directo' || s === 'flipper'
  );
}

export interface SendPulseReportInput {
  reportId: string;
  chatIds: string[];
  /** Opcional: si no se pasa, intenta recuperar de inventorySnapshot.readerRole o usa inversor_directo. */
  role?: PulseReaderRole;
}

export interface SendPulseReportResult {
  ok: boolean;
  sent: number;
  failed: number;
  errors: Array<{ chatId: string; error: string }>;
  albumSize: number;
  /** Mensaje top-level en caso de fallo previo a enviar (ej. report inexistente). */
  error?: string;
}

/**
 * Envía un informe ya persistido a una lista de chats. Reconstruye el snapshot
 * de datos llamando a `loadPulseData` con el rol del informe — es determinista
 * (mismas top N por score), no quema tokens de Anthropic.
 */
export async function sendPulseReportToTelegramAction(
  input: SendPulseReportInput,
): Promise<SendPulseReportResult> {
  if (!input.chatIds || input.chatIds.length === 0) {
    return { ok: false, sent: 0, failed: 0, errors: [], albumSize: 0, error: 'Sin destinatarios.' };
  }

  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      errors: [],
      albumSize: 0,
      error: 'TELEGRAM_BOT_TOKEN no configurado en el entorno.',
    };
  }

  const report = await prisma.pulseReport.findUnique({ where: { id: input.reportId } });
  if (!report) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      errors: [],
      albumSize: 0,
      error: 'Informe no encontrado.',
    };
  }
  if (report.dryRun) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      errors: [],
      albumSize: 0,
      error: 'Es un informe dry-run (sin Claude). Genera uno real antes de enviarlo.',
    };
  }
  if (!report.narrative) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      errors: [],
      albumSize: 0,
      error: 'El informe no tiene narrativa para enviar.',
    };
  }

  // Derivar rol: arg > snapshot.readerRole > inversor_directo
  const snapshot = report.inventorySnapshot as { readerRole?: string } | null;
  const role: PulseReaderRole =
    input.role && isReaderRole(input.role)
      ? input.role
      : snapshot?.readerRole && isReaderRole(snapshot.readerRole)
        ? snapshot.readerRole
        : 'inversor_directo';

  const data = await loadPulseData({ readerRole: role, topN: 8, weekEndDate: report.weekOf });

  const client = new TelegramClient(getTelegramConfigFromEnv());

  let sent = 0;
  let failed = 0;
  let albumSize = 0;
  const errors: Array<{ chatId: string; error: string }> = [];

  for (const chatId of input.chatIds) {
    const outcome = await sendPulseReportToTelegram(client, {
      chatId,
      markdown: report.narrative,
      properties: data.properties,
      zoneStats: data.zoneStats,
    });

    if (!outcome.narrative.ok) {
      failed += 1;
      errors.push({ chatId, error: outcome.narrative.error ?? 'desconocido' });
      continue;
    }
    sent += 1;
    albumSize = Math.max(albumSize, outcome.albumSize);
    if (outcome.album && !outcome.album.ok) {
      // narrativa OK pero álbum falló — lo loggeamos sin marcar fail global.
      errors.push({
        chatId,
        error: `Narrativa OK pero álbum falló: ${outcome.album.error ?? 'desconocido'}`,
      });
    }
  }

  return { ok: failed === 0, sent, failed, errors, albumSize };
}

function buildDryRunNarrative(data: Awaited<ReturnType<typeof loadPulseData>>): string {
  const top = data.properties.slice(0, 3);
  return `# Informe Pulse — modo DRY-RUN (sin Claude)

> Este informe se ha generado sin llamar a Claude porque \`ANTHROPIC_API_KEY\`
> no está en el entorno. Los datos son reales, pero falta el análisis narrado.
> Configura la API key y regenera para el informe completo.

## Resumen ejecutivo

${top
  .map(
    (p) =>
      `- **${p.address ?? 'Sin dirección'}, ${p.postalCode ?? '?'} ${p.city ?? ''}** — Score ${p.opportunityScore ?? 'N/A'}/100, precio ${p.price?.toLocaleString('es-ES') ?? '?'}€`,
  )
  .join('\n')}

## Inventario analizado

- ${data.properties.length} propiedades en el dataset
- ${data.zoneStats.length} zonas con muestra
- Periodo: ${data.weekStart} → ${data.weekEnd}
- Rol del lector: ${data.readerRole}
`;
}
