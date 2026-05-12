// CLI one-shot del enricher Catastro.
//
// Uso:
//   pnpm --filter @lince/scheduler enrich-catastro
//   pnpm --filter @lince/scheduler enrich-catastro -- --dry-run --max 5

import { runEnrichCatastro } from './jobs/enrich-catastro';

function parseArgs(argv: string[]): { maxItems?: number; dryRun?: boolean } {
  const out: { maxItems?: number; dryRun?: boolean } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--max') {
      const v = argv[i + 1];
      if (v) {
        out.maxItems = Math.max(1, Math.min(5000, Number.parseInt(v, 10) || 100));
        i += 1;
      }
    } else if (a.startsWith('--max=')) {
      out.maxItems = Math.max(1, Math.min(5000, Number.parseInt(a.slice(6), 10) || 100));
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runEnrichCatastro(args);
  process.exit(result.errors > 0 && result.enriched === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
