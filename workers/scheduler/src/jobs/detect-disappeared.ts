// Job: detecta propiedades que el crawler ha dejado de ver y las marca como
// `disappearedAt` con su `daysOnMarketObserved`. Esto alimenta la mediana de
// absorción por CP+bucket que usa el flip estimate para calcular monthsToSell.
//
// Lógica:
//   1. Encontrar el último crawl exitoso por cada source (pisos, boe, solvia).
//   2. Una propiedad se considera "desaparecida" si su last_seen es anterior a
//      ese último crawl menos un margen de gracia (GRACE_PERIOD_DAYS).
//   3. Solo procesamos propiedades sin disappeared_at todavía (no marcamos
//      dos veces).
//
// Caveats:
//   - "Desaparecida del crawler" != "vendida". Puede ser retirada del portal,
//     cambio de URL, error temporal. Lo asumimos como proxy razonable.
//   - El margen de gracia evita falsos positivos por errores transitorios
//     de la fuente.

import { crawlerRunsRepo, prisma } from '@lince/db';

/** Días de margen tras el último crawl antes de marcar como desaparecida. */
const GRACE_PERIOD_DAYS = 7;

export interface DetectDisappearedResult {
  runId: string;
  status: 'ok' | 'error';
  processedSources: number;
  markedDisappeared: number;
  durationMs: number;
  details: Array<{ source: string; lastSuccessfulCrawl: Date | null; marked: number }>;
}

export async function runDetectDisappeared(): Promise<DetectDisappearedResult> {
  const run = await crawlerRunsRepo.startCrawlerRun('detect-disappeared');
  const startedAt = run.startedAt;
  const details: Array<{ source: string; lastSuccessfulCrawl: Date | null; marked: number }> = [];
  let markedTotal = 0;
  let status: DetectDisappearedResult['status'] = 'ok';

  try {
    // Sources de crawler que mantienen inventario (excluimos pulse-dispatch,
    // catastro-enrich, evaluate-zones, detect-disappeared).
    const crawlerSources = ['pisos', 'boe', 'solvia'];

    for (const source of crawlerSources) {
      const lastOk = await prisma.crawlerRun.findFirst({
        where: { source, status: { in: ['ok', 'partial'] }, endedAt: { not: null } },
        orderBy: { endedAt: 'desc' },
        select: { endedAt: true },
      });

      if (!lastOk?.endedAt) {
        details.push({ source, lastSuccessfulCrawl: null, marked: 0 });
        continue;
      }

      // Threshold: una propiedad cuyo last_seen es anterior a (lastCrawl - GRACE_PERIOD_DAYS)
      // significa que el último crawl no la encontró aunque tuvo oportunidad.
      const threshold = new Date(
        lastOk.endedAt.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );

      // Marcar de un golpe con SQL — calcula days_on_market_observed = last_seen - first_seen
      const result = await prisma.$executeRaw`
        UPDATE properties
        SET
          disappeared_at = last_seen,
          days_on_market_observed = GREATEST(0, EXTRACT(DAY FROM (last_seen - first_seen))::int)
        WHERE source = ${source}
          AND disappeared_at IS NULL
          AND last_seen < ${threshold}
      `;

      const marked = Number(result);
      markedTotal += marked;
      details.push({ source, lastSuccessfulCrawl: lastOk.endedAt, marked });
    }

    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status: 'ok',
      propertiesFound: markedTotal,
      propertiesNew: 0,
      propertiesUpdated: markedTotal,
      errors: [],
    });
  } catch (err) {
    status = 'error';
    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status: 'error',
      propertiesFound: 0,
      propertiesNew: 0,
      propertiesUpdated: markedTotal,
      errors: [
        {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          at: new Date().toISOString(),
        },
      ],
    });
  }

  return {
    runId: run.id,
    status,
    processedSources: details.length,
    markedDisappeared: markedTotal,
    durationMs: Date.now() - startedAt.getTime(),
    details,
  };
}
