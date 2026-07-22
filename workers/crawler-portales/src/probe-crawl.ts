// Probe sin DB: ejecuta el `crawl()` de una fuente y vuelca los resultados a stdout.
// Útil para validar parsers antes de tocar la DB.
//
// Uso: pnpm --filter @lince/crawler-portales exec tsx src/probe-crawl.ts <solvia|boe|pisos> [--max N]

import { SolviaSource } from './sources/solvia';
import { BoeSource } from './sources/boe';
import { PisosSource } from './sources/pisos';
import { ServihabitatSource } from './sources/servihabitat';
import { AlisedaSource } from './sources/aliseda';
import { AltamiraSource } from './sources/altamira';
import type { CrawlerSource } from './sources/types';

const SOURCES: Record<string, () => CrawlerSource> = {
  solvia: () => new SolviaSource(),
  boe: () => new BoeSource(),
  pisos: () => new PisosSource(),
  servihabitat: () => new ServihabitatSource(),
  aliseda: () => new AlisedaSource(),
  altamira: () => new AltamiraSource(),
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sourceName = argv[0];
  if (!sourceName || !SOURCES[sourceName]) {
    console.error(`Uso: tsx probe-crawl.ts <${Object.keys(SOURCES).join('|')}> [--max N]`);
    process.exit(2);
  }
  let maxItems = 5;
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--max') {
      const v = argv[i + 1];
      if (v) maxItems = Math.max(1, Number.parseInt(v, 10) || 5);
    }
  }

  const ctor = SOURCES[sourceName];
  if (!ctor) {
    console.error('Fuente desconocida');
    process.exit(2);
  }
  const source = ctor();

  const t0 = Date.now();
  const outcome = await source.crawl({ maxItems });
  const ms = Date.now() - t0;

  console.log(`\n=== PROBE ${sourceName} ===`);
  console.log(`Tiempo: ${(ms / 1000).toFixed(1)}s`);
  console.log(`Resultados: ${outcome.results.length}`);
  console.log(`Errores: ${outcome.errors.length}`);

  for (let i = 0; i < outcome.results.length; i += 1) {
    const r = outcome.results[i];
    if (!r) continue;
    const p = r.property;
    console.log(`\n--- ${i + 1} ---`);
    console.log({
      source: p.source,
      sourceId: p.sourceId,
      type: p.type,
      address: p.address,
      city: p.city,
      postalCode: p.postalCode,
      m2: p.m2,
      rooms: p.rooms,
      price: p.price,
      pricePerM2: p.pricePerM2,
      isAuction: p.isAuction,
      isBankOwned: p.isBankOwned,
      auctionStartingPrice: p.auctionStartingPrice,
      condition: p.condition,
      hasTerrace: p.hasTerrace,
      hasElevator: p.hasElevator,
      redFlags: p.redFlags,
      descriptionPreview: p.description?.slice(0, 200),
      sourceUrl: p.sourceUrl,
    });
  }

  if (outcome.errors.length > 0) {
    console.log(`\n=== Errores (primeros 3) ===`);
    for (const e of outcome.errors.slice(0, 3)) {
      console.log({ url: e.url, msg: e.message });
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
