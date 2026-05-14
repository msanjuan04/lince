// Orquestador: ejecuta un crawler de una fuente, persiste cada propiedad vía
// upsert, registra una fila en `crawler_runs` con contadores y errores.
//
// Filtro de universo: descartamos cualquier propiedad cuyo CP NO esté en el
// dataset del informe de mercado (AMB + Maresme costa + Vallès Occidental).
// Esto convierte Lince en herramienta hyperlocal centrada en flipping.

import { crawlerRunsRepo, propertiesRepo, getAllUniversePostalCodes } from '@lince/db';
import type { CrawlOptions, CrawlerSource, CrawlErrorRecord, Logger } from './sources/types';

/** Set de CPs que Lince acepta. Se inicializa una vez al cargar el módulo. */
const UNIVERSE_POSTAL_CODES = new Set(getAllUniversePostalCodes());

function isInUniverse(postalCode: string | null | undefined): boolean {
  if (!postalCode) return false;
  return UNIVERSE_POSTAL_CODES.has(postalCode);
}

export type OrchestratorResult = {
  runId: string;
  source: string;
  status: 'ok' | 'partial' | 'error';
  propertiesFound: number;
  propertiesNew: number;
  propertiesUpdated: number;
  durationMs: number;
  errors: CrawlErrorRecord[];
};

export async function runSource(
  source: CrawlerSource,
  opts: CrawlOptions,
): Promise<OrchestratorResult> {
  const log: Logger = opts.logger ?? defaultLogger;
  const run = await crawlerRunsRepo.startCrawlerRun(source.name);
  log.info(`[run ${run.id}] start source=${source.name}`);

  let propertiesNew = 0;
  let propertiesUpdated = 0;
  let propertiesFound = 0;
  let propertiesOutOfUniverse = 0;
  const errors: CrawlErrorRecord[] = [];

  try {
    const outcome = await source.crawl(opts);
    propertiesFound = outcome.results.length;
    errors.push(...outcome.errors);

    for (const { property } of outcome.results) {
      // Filtro universo: descartar propiedades fuera del set de CPs del informe.
      if (!isInUniverse(property.postalCode)) {
        propertiesOutOfUniverse += 1;
        continue;
      }
      try {
        const result = await propertiesRepo.upsertProperty(property);
        if (result.isNew) propertiesNew += 1;
        else propertiesUpdated += 1;
      } catch (err) {
        errors.push({
          url: property.sourceUrl ?? undefined,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          at: new Date().toISOString(),
        });
      }
    }
    if (propertiesOutOfUniverse > 0) {
      log.info(
        `[run ${run.id}] ${propertiesOutOfUniverse} propiedades descartadas por CP fuera del universo`,
      );
    }
  } catch (err) {
    errors.push({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      at: new Date().toISOString(),
    });
  }

  const status: OrchestratorResult['status'] =
    errors.length === 0 ? 'ok' : propertiesFound > 0 ? 'partial' : 'error';
  await crawlerRunsRepo.finishCrawlerRun(run.id, {
    status,
    propertiesFound,
    propertiesNew,
    propertiesUpdated,
    errors,
  });

  const durationMs = Date.now() - run.startedAt.getTime();
  log.info(
    `[run ${run.id}] done source=${source.name} found=${propertiesFound} new=${propertiesNew} updated=${propertiesUpdated} skipped_out_of_universe=${propertiesOutOfUniverse} errs=${errors.length} duration=${durationMs}ms`,
  );

  return {
    runId: run.id,
    source: source.name,
    status,
    propertiesFound,
    propertiesNew,
    propertiesUpdated,
    durationMs,
    errors,
  };
}

const defaultLogger: Logger = {
  info: (m, meta) => console.log(`[INFO] ${m}`, meta ?? ''),
  warn: (m, meta) => console.warn(`[WARN] ${m}`, meta ?? ''),
  error: (m, meta) => console.error(`[ERROR] ${m}`, meta ?? ''),
};
