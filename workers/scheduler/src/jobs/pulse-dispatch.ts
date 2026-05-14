// Job: ejecuta el dispatch del informe Pulse semanal a los chats de Telegram
// configurados via env. Persiste la ejecución como crawler_runs(source='pulse-dispatch')
// para que el dashboard de estado del sistema pueda mostrarla.
//
// Configuración (env):
//   TELEGRAM_PULSE_RECIPIENTS — JSON o CSV (chatId:role)
//   TELEGRAM_CHAT_IDS — fallback CSV simple, rol default = flipper
//   PULSE_DEFAULT_ROLE — rol cuando no se especifica (default 'flipper')
//   PULSE_TOP_N — propiedades top a enviar al prompt (default 8)

import { crawlerRunsRepo } from '@lince/db';
import { dispatchPulseReports, type PulseRecipient } from '@lince/ai';
import type { PulseReaderRole } from '@lince/ai';

const VALID_ROLES: PulseReaderRole[] = [
  'inmobiliaria',
  'buying_agent',
  'inversor_directo',
  'flipper',
];

function isRole(s: string): s is PulseReaderRole {
  return (VALID_ROLES as string[]).includes(s);
}

function parseRecipients(): PulseRecipient[] {
  const defaultRoleRaw = process.env['PULSE_DEFAULT_ROLE'] ?? 'flipper';
  const defaultRole: PulseReaderRole = isRole(defaultRoleRaw) ? defaultRoleRaw : 'flipper';

  const detailed = process.env['TELEGRAM_PULSE_RECIPIENTS']?.trim();
  if (detailed) {
    if (detailed.startsWith('[')) {
      try {
        const arr = JSON.parse(detailed) as Array<{ chatId: string | number; role?: string }>;
        return arr
          .filter((r) => r.chatId)
          .map((r) => ({
            chatId: r.chatId,
            role: r.role && isRole(r.role) ? r.role : defaultRole,
          }));
      } catch (err) {
        console.error('[pulse-dispatch] JSON inválido en TELEGRAM_PULSE_RECIPIENTS:', err);
        return [];
      }
    }
    const out: PulseRecipient[] = [];
    for (const pair of detailed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const [chatId, role] = pair.split(':');
      if (!chatId) continue;
      const r = role && isRole(role) ? role : defaultRole;
      out.push({ chatId: chatId.trim(), role: r });
    }
    return out;
  }

  const simple = process.env['TELEGRAM_CHAT_IDS']?.trim();
  if (simple) {
    return simple
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((chatId) => ({ chatId, role: defaultRole }));
  }

  return [];
}

export interface PulseDispatchJobResult {
  runId: string;
  status: 'ok' | 'partial' | 'error';
  recipients: number;
  sent: number;
  failed: number;
  estimatedCostEur: number;
  durationMs: number;
}

export async function runPulseDispatch(): Promise<PulseDispatchJobResult> {
  const run = await crawlerRunsRepo.startCrawlerRun('pulse-dispatch');
  const recipients = parseRecipients();

  if (recipients.length === 0) {
    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status: 'error',
      propertiesFound: 0,
      propertiesNew: 0,
      propertiesUpdated: 0,
      errors: [
        {
          message: 'Sin destinatarios. Define TELEGRAM_CHAT_IDS o TELEGRAM_PULSE_RECIPIENTS.',
          at: new Date().toISOString(),
        },
      ],
    });
    return {
      runId: run.id,
      status: 'error',
      recipients: 0,
      sent: 0,
      failed: 0,
      estimatedCostEur: 0,
      durationMs: 0,
    };
  }

  const topN = Number.parseInt(process.env['PULSE_TOP_N'] ?? '8', 10);

  const outcome = await dispatchPulseReports(recipients, { topN: isNaN(topN) ? 8 : topN });

  const status: PulseDispatchJobResult['status'] =
    outcome.failed === 0 ? 'ok' : outcome.sent > 0 ? 'partial' : 'error';

  await crawlerRunsRepo.finishCrawlerRun(run.id, {
    status,
    propertiesFound: outcome.recipients,
    propertiesNew: outcome.sent,
    propertiesUpdated: 0,
    errors: outcome.errors.map((e) => ({
      message: `chat=${e.chatId}: ${e.error}`,
      at: new Date().toISOString(),
    })),
  });

  return {
    runId: run.id,
    status,
    recipients: outcome.recipients,
    sent: outcome.sent,
    failed: outcome.failed,
    estimatedCostEur: outcome.estimatedCostEur,
    durationMs: outcome.durationMs,
  };
}
