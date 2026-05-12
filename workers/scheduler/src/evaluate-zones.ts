// CLI one-shot del evaluador de zonas.
//
// Uso:
//   pnpm --filter @lince/scheduler evaluate-zones
//   pnpm --filter @lince/scheduler evaluate-zones -- --dry-run

import { runEvaluateZones } from './jobs/evaluate-zones';

function parseArgs(argv: string[]): { dryRun?: boolean } {
  const out: { dryRun?: boolean } = {};
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runEvaluateZones(args);
  process.exit(result.alertsFailed > 0 && result.alertsSent === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
