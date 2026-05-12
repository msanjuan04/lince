// Job: ejecuta los crawlers de las fuentes Tier verde en secuencia.
//   Pisos.com → BOE → Solvia
//
// Secuencial (no paralelo) por dos razones:
//   1. Cada fuente tiene su rate limit propio. Concurrencia no acelera.
//   2. La DB Supabase tiene un pool limitado en el Transaction pooler (6543).
//      Mejor no presionarlo con N runs simultáneos.
//
// Cada `runSource` registra su fila en `crawler_runs` con status, contadores
// y errores. El job aquí solo orquesta y loggea el resumen.

import {
  BoeSource,
  PisosSource,
  SolviaSource,
  runSource,
  type CrawlerSource,
  type OrchestratorResult,
} from '@lince/crawler-portales';

export interface WeeklySnapshotOptions {
  /** Fuentes a ejecutar (orden importa). Por defecto: pisos, boe, solvia. */
  sources?: string[];
  /** Máximo de propiedades por fuente. Por defecto 50. */
  maxPerSource?: number;
  /** CPs a filtrar (aplica a todas las fuentes que soporten filtro). */
  postalCodes?: string[];
}

export interface WeeklySnapshotResult {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  runs: OrchestratorResult[];
  totals: {
    propertiesFound: number;
    propertiesNew: number;
    propertiesUpdated: number;
    errors: number;
  };
}

const SOURCE_REGISTRY: Record<string, () => CrawlerSource> = {
  pisos: () => new PisosSource(),
  boe: () => new BoeSource(),
  solvia: () => new SolviaSource(),
};

export async function runWeeklySnapshot(
  opts: WeeklySnapshotOptions = {},
): Promise<WeeklySnapshotResult> {
  const sources = opts.sources ?? ['pisos', 'boe', 'solvia'];
  const maxPerSource = opts.maxPerSource ?? 50;
  const startedAt = new Date();
  const runs: OrchestratorResult[] = [];

  console.log(
    `\n[weekly-snapshot] start at ${startedAt.toISOString()} | sources=${sources.join(',')} | max=${maxPerSource}/source\n`,
  );

  for (const sourceName of sources) {
    const ctor = SOURCE_REGISTRY[sourceName];
    if (!ctor) {
      console.warn(`[weekly-snapshot] fuente desconocida: ${sourceName}, salto`);
      continue;
    }
    const source = ctor();
    try {
      const result = await runSource(source, {
        maxItems: maxPerSource,
        postalCodes: opts.postalCodes,
      });
      runs.push(result);
    } catch (err) {
      console.error(`[weekly-snapshot] ${sourceName} FATAL:`, err);
      // El runSource ya gestiona errores internos. Si llega aquí es algo más grave.
      // No paramos el job entero — la siguiente fuente puede tener éxito.
    }
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();

  const totals = runs.reduce(
    (acc, r) => ({
      propertiesFound: acc.propertiesFound + r.propertiesFound,
      propertiesNew: acc.propertiesNew + r.propertiesNew,
      propertiesUpdated: acc.propertiesUpdated + r.propertiesUpdated,
      errors: acc.errors + r.errors.length,
    }),
    { propertiesFound: 0, propertiesNew: 0, propertiesUpdated: 0, errors: 0 },
  );

  console.log(`\n[weekly-snapshot] done in ${(durationMs / 1000).toFixed(1)}s`);
  console.log('=== TOTALES ===');
  console.log(`  Found:   ${totals.propertiesFound}`);
  console.log(`  New:     ${totals.propertiesNew}`);
  console.log(`  Updated: ${totals.propertiesUpdated}`);
  console.log(`  Errores: ${totals.errors}\n`);

  return { startedAt, endedAt, durationMs, runs, totals };
}
