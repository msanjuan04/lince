// Scheduler daemon — long-running con node-cron. Dos jobs registrados:
//
//   1. DAILY SNAPSHOT (default 04:00 cada día): ejecuta crawlers + Catastro +
//      evaluate-zones. Esto es lo que mantiene el inventario fresco para
//      flipping.
//
//   2. WEEKLY PULSE (default lunes 08:00): genera + manda informe Pulse a los
//      chats de Telegram configurados.
//
// Configuración (env):
//   SCHEDULER_CRON_DAILY  — cron string del snapshot diario (default '0 4 * * *')
//   SCHEDULER_CRON_PULSE  — cron string del pulse (default '0 8 * * 1')
//   SCHEDULER_TZ          — zona horaria (default 'Europe/Madrid')
//   SCHEDULER_RUN_ON_START — '1' para ejecutar ambos jobs al arrancar
//
// Migración a BullMQ + Redis (Fase 2.C): cuando `REDIS_URL` esté disponible,
// reemplazaremos `cron.schedule(...)` por un BullMQ Worker + cola persistente.

import cron from 'node-cron';
import { runWeeklySnapshot } from './jobs/weekly-snapshot';
import { runPulseDispatch } from './jobs/pulse-dispatch';

const DEFAULT_CRON_DAILY = '0 4 * * *'; // todos los días 04:00
const DEFAULT_CRON_PULSE = '0 8 * * 1'; // lunes 08:00
const DEFAULT_TZ = 'Europe/Madrid';
const DEFAULT_MAX = 50;
const DEFAULT_SOURCES = 'pisos,boe,solvia';

function parseSources(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_SOURCES.split(',');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseMax(raw: string | undefined): number {
  if (!raw) return DEFAULT_MAX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX;
  return Math.min(1000, n);
}

async function main(): Promise<void> {
  // Compatibilidad: si está SCHEDULER_CRON (antiguo nombre) lo usamos para
  // el cron diario. Si no, los nuevos defaults.
  const cronDaily =
    process.env['SCHEDULER_CRON_DAILY'] ?? process.env['SCHEDULER_CRON'] ?? DEFAULT_CRON_DAILY;
  const cronPulse = process.env['SCHEDULER_CRON_PULSE'] ?? DEFAULT_CRON_PULSE;
  const tz = process.env['SCHEDULER_TZ'] ?? DEFAULT_TZ;
  const sources = parseSources(process.env['SCHEDULER_SOURCES']);
  const maxPerSource = parseMax(process.env['SCHEDULER_MAX_PER_SOURCE']);

  if (!cron.validate(cronDaily)) {
    console.error(`SCHEDULER_CRON_DAILY inválido: "${cronDaily}". Aborto.`);
    process.exit(2);
  }
  if (!cron.validate(cronPulse)) {
    console.error(`SCHEDULER_CRON_PULSE inválido: "${cronPulse}". Aborto.`);
    process.exit(2);
  }

  console.log('=== Lince Scheduler ===');
  console.log(
    `Daily snapshot:  ${cronDaily} (${tz}) → ${sources.join(', ')}, max ${maxPerSource}/src`,
  );
  console.log(`Weekly Pulse:    ${cronPulse} (${tz})`);
  console.log(`Started:         ${new Date().toISOString()}`);
  console.log('-----------------------------\n');

  if (process.env['SCHEDULER_RUN_ON_START'] === '1') {
    console.log('SCHEDULER_RUN_ON_START=1 detectado → ejecuto ambos jobs ahora.');
    await runWeeklySnapshot({ sources, maxPerSource });
    await safeRunPulse();
  }

  // Cron 1: snapshot diario
  cron.schedule(
    cronDaily,
    async () => {
      const tick = new Date();
      console.log(`\n[cron daily ${tick.toISOString()}] disparando daily-snapshot`);
      try {
        await runWeeklySnapshot({ sources, maxPerSource });
      } catch (err) {
        console.error('[cron daily] error no manejado:', err);
      }
    },
    { timezone: tz },
  );

  // Cron 2: pulse semanal
  cron.schedule(
    cronPulse,
    async () => {
      const tick = new Date();
      console.log(`\n[cron pulse ${tick.toISOString()}] disparando pulse-dispatch`);
      await safeRunPulse();
    },
    { timezone: tz },
  );

  console.log('Scheduler armado. Esperando ticks. (Ctrl+C para parar)');
}

async function safeRunPulse(): Promise<void> {
  try {
    const result = await runPulseDispatch();
    console.log(
      `[pulse-dispatch] done status=${result.status} recipients=${result.recipients} sent=${result.sent} failed=${result.failed} cost=${result.estimatedCostEur}€ duration=${result.durationMs}ms`,
    );
  } catch (err) {
    console.error('[pulse-dispatch] error no manejado:', err);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
