// Dispatch del informe Pulse semanal a una lista de chats de Telegram.
//
// Lee la config de destinatarios desde una de estas fuentes (en este orden):
//   1. Flag CLI: --to chatId1,chatId2,...
//   2. Env TELEGRAM_PULSE_RECIPIENTS — formato JSON o CSV.
//        JSON: '[{"chatId": -1001234, "role": "inversor_directo"}, ...]'
//        CSV:  '-1001234:inversor_directo,55555:inmobiliaria'
//   3. Env TELEGRAM_CHAT_IDS — CSV simple, todos reciben el informe del role default.
//
// Uso:
//   pnpm --filter @lince/ai pulse:dispatch
//   pnpm --filter @lince/ai pulse:dispatch -- --role inversor_directo --top 8
//   pnpm --filter @lince/ai pulse:dispatch -- --to -1001234567890
//
// El informe se genera UNA VEZ por rol distinto que aparezca en los destinatarios
// (cache_hit del system prompt → barato). Cada chat recibe el informe de su rol.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TelegramClient, getTelegramConfigFromEnv } from '@lince/notifier';
import {
  generatePulseReport,
  loadPulseData,
  sendPulseReportToTelegram,
  type PulseReaderRole,
  type PulsePropertyInput,
  type PulseZoneStats,
} from '../src';

// Soft env loader (idéntico al de probe-pulse-report.ts).
function loadEnvSoft(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key] && value) process.env[key] = value;
    }
    break;
  }
}

loadEnvSoft();

interface Recipient {
  chatId: string;
  role: PulseReaderRole;
}

const VALID_ROLES: PulseReaderRole[] = [
  'inmobiliaria',
  'buying_agent',
  'inversor_directo',
  'flipper',
];

function isRole(s: string): s is PulseReaderRole {
  return (VALID_ROLES as string[]).includes(s);
}

function parseRecipients(opts: { cliTo?: string; defaultRole: PulseReaderRole }): Recipient[] {
  // Prioridad 1: flag CLI.
  if (opts.cliTo) {
    return opts.cliTo
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((chatId) => ({ chatId, role: opts.defaultRole }));
  }

  // Prioridad 2: TELEGRAM_PULSE_RECIPIENTS — JSON o CSV.
  const detailed = process.env.TELEGRAM_PULSE_RECIPIENTS?.trim();
  if (detailed) {
    if (detailed.startsWith('[')) {
      // JSON
      try {
        const parsed = JSON.parse(detailed) as Array<{ chatId: string | number; role: string }>;
        return parsed
          .filter((r) => isRole(r.role))
          .map((r) => ({ chatId: String(r.chatId), role: r.role as PulseReaderRole }));
      } catch (err) {
        console.error('[dispatch] Error parseando TELEGRAM_PULSE_RECIPIENTS JSON:', err);
        return [];
      }
    }
    // CSV: chatId:role,chatId:role,...
    return detailed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [chatId, role] = pair.split(':');
        if (!chatId || !role || !isRole(role)) {
          console.warn(`[dispatch] Ignorando entrada inválida: "${pair}"`);
          return null;
        }
        return { chatId: chatId.trim(), role: role as PulseReaderRole };
      })
      .filter((r): r is Recipient => r !== null);
  }

  // Prioridad 3: TELEGRAM_CHAT_IDS — CSV simple, todos rol default.
  const simple = process.env.TELEGRAM_CHAT_IDS?.trim();
  if (simple) {
    return simple
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((chatId) => ({ chatId, role: opts.defaultRole }));
  }

  return [];
}

interface Args {
  defaultRole: PulseReaderRole;
  topN: number;
  cliTo?: string;
  postalCodes?: string[];
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { defaultRole: 'inversor_directo', topN: 8 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--role') {
      const v = argv[i + 1];
      if (v && isRole(v)) out.defaultRole = v;
    } else if (a === '--top') {
      const v = argv[i + 1];
      if (v) out.topN = Math.max(1, Number.parseInt(v, 10) || 8);
    } else if (a === '--to') {
      out.cliTo = argv[i + 1];
    } else if (a === '--cp') {
      const v = argv[i + 1];
      if (v)
        out.postalCodes = v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const recipients = parseRecipients({ cliTo: args.cliTo, defaultRole: args.defaultRole });

  if (recipients.length === 0) {
    console.error(
      '[dispatch] No hay destinatarios configurados. Define TELEGRAM_CHAT_IDS o TELEGRAM_PULSE_RECIPIENTS, o pasa --to.',
    );
    process.exit(2);
  }

  console.error(`[dispatch] ${recipients.length} destinatario(s) configurado(s).`);

  // Generar UN informe por rol único (cache hit del prompt → barato).
  const uniqueRoles = Array.from(new Set(recipients.map((r) => r.role)));
  console.error(`[dispatch] Roles a generar: ${uniqueRoles.join(', ')}`);

  interface RoleReport {
    markdown: string;
    properties: PulsePropertyInput[];
    zoneStats: PulseZoneStats[];
  }

  const reportByRole: Record<string, RoleReport> = {};
  for (const role of uniqueRoles) {
    console.error(`[dispatch] Generando informe para rol=${role}...`);
    const data = await loadPulseData({
      readerRole: role,
      topN: args.topN,
      postalCodes: args.postalCodes,
    });
    if (data.properties.length === 0) {
      console.error(`[dispatch] DB sin propiedades para ${role}, saltando.`);
      continue;
    }
    const t0 = Date.now();
    const result = await generatePulseReport(data);
    console.error(
      `[dispatch]   OK en ${Date.now() - t0}ms — tokens: in=${result.usage.inputTokens}, out=${result.usage.outputTokens}, cache_read=${result.usage.cacheReadInputTokens}`,
    );
    reportByRole[role] = {
      markdown: result.markdown,
      properties: data.properties,
      zoneStats: data.zoneStats,
    };
  }

  // Mandar a cada destinatario el informe de su rol.
  const telegram = new TelegramClient(getTelegramConfigFromEnv());
  console.error(
    `[dispatch] Telegram ${telegram.isDryRun() ? 'DRY' : 'LIVE'} mode. Enviando ${recipients.length} mensaje(s)...`,
  );

  const failures: Array<{ chatId: string; error: string }> = [];
  for (const recipient of recipients) {
    const report = reportByRole[recipient.role];
    if (!report) {
      console.warn(
        `[dispatch] Sin informe para rol=${recipient.role}, salto chat ${recipient.chatId}.`,
      );
      continue;
    }
    const outcome = await sendPulseReportToTelegram(telegram, {
      chatId: recipient.chatId,
      markdown: report.markdown,
      properties: report.properties,
      zoneStats: report.zoneStats,
    });

    if (!outcome.narrative.ok) {
      failures.push({ chatId: recipient.chatId, error: outcome.narrative.error ?? 'unknown' });
      console.error(
        `[dispatch] FAIL narrativa chat=${recipient.chatId} role=${recipient.role}: ${outcome.narrative.error}`,
      );
      continue;
    }
    console.error(
      `[dispatch] OK narrativa chat=${recipient.chatId} role=${recipient.role} (${outcome.narrative.chunks} chunk${outcome.narrative.chunks > 1 ? 's' : ''})`,
    );

    if (outcome.albumSize === 0) {
      console.error(`[dispatch]   (sin fotos para top, salto álbum chat=${recipient.chatId})`);
    } else if (outcome.album && !outcome.album.ok) {
      console.error(
        `[dispatch] WARN álbum chat=${recipient.chatId}: ${outcome.album.error} — narrativa enviada igual`,
      );
    } else if (outcome.album) {
      console.error(
        `[dispatch] OK álbum chat=${recipient.chatId} (${outcome.albumSize} foto${outcome.albumSize > 1 ? 's' : ''}, ${outcome.album.chunks} batch${outcome.album.chunks > 1 ? 'es' : ''})`,
      );
    }
  }

  console.error('');
  console.error(
    `[dispatch] Resumen: ${recipients.length - failures.length}/${recipients.length} enviados, ${failures.length} fallos.`,
  );
  if (failures.length > 0) process.exit(1);
}

main()
  .catch((err: unknown) => {
    console.error('[dispatch] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import('@lince/db');
    await prisma.$disconnect();
  });
