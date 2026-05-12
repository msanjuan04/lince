// Orquestador: ejecuta un crawler de una fuente, persiste cada propiedad vía
// upsert, registra una fila en `crawler_runs` con contadores y errores.

import { crawlerRunsRepo, propertiesRepo } from '@lince/db';
import type { CrawlOptions, CrawlerSource, CrawlErrorRecord, Logger } from './sources/types';

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
  const errors: CrawlErrorRecord[] = [];

  try {
    const outcome = await source.crawl(opts);
    propertiesFound = outcome.results.length;
    errors.push(...outcome.errors);

    for (const { property } of outcome.results) {
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
    `[run ${run.id}] done source=${source.name} found=${propertiesFound} new=${propertiesNew} updated=${propertiesUpdated} errs=${errors.length} duration=${durationMs}ms`,
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
