// CLI one-shot: ejecuta el weekly-snapshot inmediatamente y sale.
// Útil en desarrollo y para tests manuales.
//
// Uso:
//   pnpm --filter @lince/scheduler trigger-now
//   pnpm --filter @lince/scheduler trigger-now -- --sources solvia --max 10

import { runWeeklySnapshot } from './jobs/weekly-snapshot';

function parseArgs(argv: string[]): {
  sources?: string[];
  maxPerSource?: number;
  postalCodes?: string[];
} {
  const out: { sources?: string[]; maxPerSource?: number; postalCodes?: string[] } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    const eqIdx = a.indexOf('=');
    const key = eqIdx >= 0 ? a.slice(0, eqIdx) : a;
    const value = eqIdx >= 0 ? a.slice(eqIdx + 1) : argv[i + 1];
    if (key === '--sources') {
      if (value)
        out.sources = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      if (eqIdx < 0) i += 1;
    } else if (key === '--max') {
      if (value) out.maxPerSource = Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 50));
      if (eqIdx < 0) i += 1;
    } else if (key === '--postal') {
      if (value)
        out.postalCodes = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      if (eqIdx < 0) i += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runWeeklySnapshot(args);
  // exit 1 si TODO falló; 0 si al menos una fuente tuvo éxito (los errores
  // individuales ya quedaron en crawler_runs.errors).
  const anyOk = result.runs.some((r) => r.status !== 'error');
  process.exit(anyOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
