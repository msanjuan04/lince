// Scheduler daemon — long-running con node-cron.
// Lee el cron string de `SCHEDULER_CRON` (default lunes 6:00 hora Madrid).
//
// Uso:
//   pnpm --filter @lince/scheduler start          # foreground daemon
//   pnpm --filter @lince/scheduler dev            # con watch para desarrollo
//
// Migración a BullMQ + Redis (Fase 2.C): cuando `REDIS_URL` esté disponible,
// reemplazaremos el `cron.schedule(...)` por un BullMQ Worker + cola persistente.
// El job (`runWeeklySnapshot`) no cambia, solo el trigger.

import cron from 'node-cron';
import { runWeeklySnapshot } from './jobs/weekly-snapshot';

const DEFAULT_CRON = '0 6 * * 1'; // lunes 06:00
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
  const cronExpr = process.env['SCHEDULER_CRON'] ?? DEFAULT_CRON;
  const tz = process.env['SCHEDULER_TZ'] ?? DEFAULT_TZ;
  const sources = parseSources(process.env['SCHEDULER_SOURCES']);
  const maxPerSource = parseMax(process.env['SCHEDULER_MAX_PER_SOURCE']);

  if (!cron.validate(cronExpr)) {
    console.error(`Cron string inválido: "${cronExpr}". Aborto.`);
    process.exit(2);
  }

  console.log('=== Lince Pulse Scheduler ===');
  console.log(`Cron:      ${cronExpr} (${tz})`);
  console.log(`Sources:   ${sources.join(', ')}`);
  console.log(`Max/src:   ${maxPerSource}`);
  console.log(`Started:   ${new Date().toISOString()}`);
  console.log('-----------------------------\n');

  // Si quieres ejecutar inmediatamente al arrancar (útil tras un deploy o
  // reinicio para no perder un ciclo), setea SCHEDULER_RUN_ON_START=1.
  if (process.env['SCHEDULER_RUN_ON_START'] === '1') {
    console.log('SCHEDULER_RUN_ON_START=1 detectado → ejecuto job ahora.');
    await runWeeklySnapshot({ sources, maxPerSource });
  }

  cron.schedule(
    cronExpr,
    async () => {
      const tick = new Date();
      console.log(`\n[cron tick ${tick.toISOString()}] disparando weekly-snapshot`);
      try {
        await runWeeklySnapshot({ sources, maxPerSource });
      } catch (err) {
        console.error('[cron] error no manejado:', err);
      }
    },
    { timezone: tz },
  );

  console.log('Scheduler armado. Esperando ticks. (Ctrl+C para parar)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
