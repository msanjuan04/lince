// CLI one-shot del job de scoring.
//
// Uso:
//   pnpm --filter @lince/scheduler score -- --dry-run
//   pnpm --filter @lince/scheduler score

import { runScoreProperties } from './jobs/score-properties';

function parseArgs(argv: string[]): { dryRun?: boolean } {
  const out: { dryRun?: boolean } = {};
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runScoreProperties(args);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'error' ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
