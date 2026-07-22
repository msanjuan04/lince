// CLI del crawler. Uso:
//   pnpm crawl --source <solvia|boe|pisos|servihabitat> [--postal 08003,08010] [--max 50]
//
// Por defecto: max 50 ítems por fuente (smoke). Filtro de CP opcional.

import { SolviaSource } from './sources/solvia';
import { BoeSource } from './sources/boe';
import { PisosSource } from './sources/pisos';
import { ServihabitatSource } from './sources/servihabitat';
import { AlisedaSource } from './sources/aliseda';
import { AltamiraSource } from './sources/altamira';
import { runSource } from './orchestrator';
import type { CrawlerSource } from './sources/types';

type Args = {
  source: string | null;
  postalCodes: string[];
  maxItems: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { source: null, postalCodes: [], maxItems: 50 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    const eqIdx = a.indexOf('=');
    const key = eqIdx >= 0 ? a.slice(0, eqIdx) : a;
    const value = eqIdx >= 0 ? a.slice(eqIdx + 1) : argv[i + 1];
    if (key === '--source') {
      if (value) out.source = value;
      if (eqIdx < 0) i += 1;
    } else if (key === '--postal') {
      if (value)
        out.postalCodes = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      if (eqIdx < 0) i += 1;
    } else if (key === '--max') {
      if (value) out.maxItems = Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 50));
      if (eqIdx < 0) i += 1;
    }
  }
  return out;
}

const SOURCES: Record<string, () => CrawlerSource> = {
  solvia: () => new SolviaSource(),
  boe: () => new BoeSource(),
  pisos: () => new PisosSource(),
  servihabitat: () => new ServihabitatSource(),
  aliseda: () => new AlisedaSource(),
  altamira: () => new AltamiraSource(),
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !SOURCES[args.source]) {
    console.error(
      `Uso: pnpm crawl --source <${Object.keys(SOURCES).join('|')}> [--postal 08003,08010] [--max 50]`,
    );
    process.exit(2);
  }

  const ctor = SOURCES[args.source];
  if (!ctor) {
    console.error(`Fuente desconocida: ${args.source}`);
    process.exit(2);
  }
  const source = ctor();

  const result = await runSource(source, {
    postalCodes: args.postalCodes.length > 0 ? args.postalCodes : undefined,
    maxItems: args.maxItems,
  });

  console.log('\n=== RESULTADO ===');
  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        source: result.source,
        status: result.status,
        found: result.propertiesFound,
        new: result.propertiesNew,
        updated: result.propertiesUpdated,
        duration: `${(result.durationMs / 1000).toFixed(1)}s`,
        errorCount: result.errors.length,
        firstErrors: result.errors.slice(0, 3).map((e) => ({ url: e.url, msg: e.message })),
      },
      null,
      2,
    ),
  );

  process.exit(result.status === 'error' ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
