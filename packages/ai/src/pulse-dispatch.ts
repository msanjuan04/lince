// Dispatch programático del informe Pulse — usado tanto por el CLI script
// como por el scheduler que lo ejecuta cron-driven.
//
// El CLI parsea env/args y llama aquí. El scheduler tiene env del proceso y
// llama directo. La lógica core (generar por rol único, mandar a cada chat con
// narrativa + álbum) es la misma.

import { TelegramClient, getTelegramConfigFromEnv } from '@lince/notifier';
import { generatePulseReport } from './pulse-agent';
import { loadPulseData } from './pulse-data';
import { sendPulseReportToTelegram } from './pulse-telegram';
import type { PulseReaderRole, PulsePropertyInput, PulseZoneStats } from './prompts/pulse-agent';

export interface PulseRecipient {
  chatId: string | number;
  role: PulseReaderRole;
}

export interface DispatchOptions {
  /** Top N propiedades a enviar al prompt (default 8). */
  topN?: number;
  /** CPs a filtrar (default: todos del universo). */
  postalCodes?: string[];
  /** Si true, no manda nada — solo loggea. */
  dryRun?: boolean;
}

export interface DispatchOutcome {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  recipients: number;
  sent: number;
  failed: number;
  errors: Array<{ chatId: string | number; error: string }>;
  /** Tokens usados por rol único (cache hit del prompt → barato a partir del 2º). */
  rolesGenerated: number;
  totalTokensIn: number;
  totalTokensOut: number;
  /** Coste estimado en €. */
  estimatedCostEur: number;
}

/**
 * Genera UN informe por rol único entre los destinatarios y manda narrativa +
 * álbum a cada chat. Si no hay datos para un rol, se salta los chats de ese
 * rol con warning.
 */
export async function dispatchPulseReports(
  recipients: PulseRecipient[],
  opts: DispatchOptions = {},
): Promise<DispatchOutcome> {
  const startedAt = new Date();
  const topN = opts.topN ?? 8;
  const errors: Array<{ chatId: string | number; error: string }> = [];

  if (recipients.length === 0) {
    return {
      startedAt,
      endedAt: new Date(),
      durationMs: 0,
      recipients: 0,
      sent: 0,
      failed: 0,
      errors: [],
      rolesGenerated: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      estimatedCostEur: 0,
    };
  }

  // Generar un informe por rol único
  const uniqueRoles = Array.from(new Set(recipients.map((r) => r.role)));
  interface RoleReport {
    markdown: string;
    properties: PulsePropertyInput[];
    zoneStats: PulseZoneStats[];
    tokensIn: number;
    tokensOut: number;
  }
  const reportByRole: Record<string, RoleReport> = {};

  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const role of uniqueRoles) {
    const data = await loadPulseData({ readerRole: role, topN, postalCodes: opts.postalCodes });
    if (data.properties.length === 0) {
      console.error(`[pulse-dispatch] sin propiedades para rol=${role}, salto`);
      continue;
    }
    const result = await generatePulseReport(data);
    totalTokensIn += result.usage.inputTokens;
    totalTokensOut += result.usage.outputTokens;
    reportByRole[role] = {
      markdown: result.markdown,
      properties: data.properties,
      zoneStats: data.zoneStats,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
    };
  }

  // Calcular coste estimado (Claude Opus 4.7: $15/M in, $75/M out, EUR≈USD)
  const estimatedCostEur =
    Math.round(((totalTokensIn * 15 + totalTokensOut * 75) / 1_000_000) * 10000) / 10000;

  // Enviar a cada destinatario
  const telegram = new TelegramClient(getTelegramConfigFromEnv());
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const report = reportByRole[recipient.role];
    if (!report) {
      // Sin report para ese rol — no es fallo de envío, es falta de datos.
      continue;
    }
    if (opts.dryRun) {
      sent += 1;
      continue;
    }
    const outcome = await sendPulseReportToTelegram(telegram, {
      chatId: recipient.chatId,
      markdown: report.markdown,
      properties: report.properties,
      zoneStats: report.zoneStats,
    });
    if (!outcome.narrative.ok) {
      failed += 1;
      errors.push({ chatId: recipient.chatId, error: outcome.narrative.error ?? 'desconocido' });
    } else {
      sent += 1;
    }
  }

  const endedAt = new Date();
  return {
    startedAt,
    endedAt,
    durationMs: endedAt.getTime() - startedAt.getTime(),
    recipients: recipients.length,
    sent,
    failed,
    errors,
    rolesGenerated: Object.keys(reportByRole).length,
    totalTokensIn,
    totalTokensOut,
    estimatedCostEur,
  };
}
