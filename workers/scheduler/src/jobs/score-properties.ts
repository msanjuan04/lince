// Job: persiste `opportunity_score` y `zone_avg_price_per_m2` en cada
// propiedad usando la lógica honesta del valuator (`computeOpportunityFacts`).
//
// Por qué este job existe:
//   - `computeOpportunityFacts` ya se usaba en la web (read-time, on the fly).
//   - Pero el agente Pulse ordena por `property.opportunityScore desc` desde
//     la DB. Si nadie persiste el score, todos son NULL y el Pulse acaba
//     mandando las propiedades más recientes en vez de las más infravaloradas.
//   - Sin persistencia tampoco se puede filtrar/ordenar desde el dashboard.
//
// Estrategia:
//   1. Una sola query de medianas por CP+bucket (getZoneStatsMap).
//   2. Una sola query del histórico agregado de rebajas (getPriceHistorySummaryMap).
//   3. Loop in-memory por todas las propiedades con price_per_m2 conocido.
//      computeOpportunityFacts y persistir con un UPDATE por propiedad.
//
// Coste: una transacción de UPDATEs. Para los volúmenes actuales (≤10k props)
// es trivial. Si crece a 100k+, agrupar por batches.

import {
  crawlerRunsRepo,
  prisma,
  zoneStatsRepo,
  priceHistorySummaryRepo,
  bucketOf,
} from '@lince/db';
import { computeOpportunityFacts } from '@lince/ai';

export interface ScorePropertiesResult {
  runId: string;
  status: 'ok' | 'error';
  totalEvaluated: number;
  scored: number;
  unscoredNoMedian: number;
  unscoredMissingPrice: number;
  durationMs: number;
}

export interface ScorePropertiesOptions {
  /** Si true, no escribe — solo calcula y loggea distribución. */
  dryRun?: boolean;
}

export async function runScoreProperties(
  opts: ScorePropertiesOptions = {},
): Promise<ScorePropertiesResult> {
  const run = await crawlerRunsRepo.startCrawlerRun('score-properties');
  const startedAt = run.startedAt;
  let status: ScorePropertiesResult['status'] = 'ok';
  let scored = 0;
  let unscoredNoMedian = 0;
  let unscoredMissingPrice = 0;
  const errors: Array<{ message: string; at: string }> = [];

  try {
    const zoneStats = await zoneStatsRepo.getZoneStatsMap();
    const priceHistory = await priceHistorySummaryRepo.getPriceHistorySummaryMap();

    const properties = await prisma.property.findMany({
      select: {
        id: true,
        pricePerM2: true,
        m2: true,
        rooms: true,
        postalCode: true,
        isAuction: true,
        isBankOwned: true,
        condition: true,
        redFlags: true,
        hasTerrace: true,
        hasElevator: true,
        floor: true,
        yearBuilt: true,
        firstSeen: true,
      },
    });

    const now = Date.now();

    for (const p of properties) {
      if (!p.pricePerM2 || !p.postalCode) {
        unscoredMissingPrice += 1;
        continue;
      }

      const stats = zoneStats.get(p.postalCode);
      const bucket = bucketOf({ isAuction: p.isAuction, isBankOwned: p.isBankOwned });
      const bucketStats = stats?.buckets[bucket];

      const history = priceHistory.get(p.id);
      const daysObservedByLince = Math.floor((now - p.firstSeen.getTime()) / (1000 * 60 * 60 * 24));

      const facts = computeOpportunityFacts({
        pricePerM2: Number(p.pricePerM2),
        bucketMedianEurM2: bucketStats?.medianEurM2 ?? null,
        bucketSampleSize: bucketStats?.count ?? 0,
        isAuction: p.isAuction === true,
        isBankOwned: p.isBankOwned === true,
        condition: p.condition,
        redFlags: p.redFlags ?? [],
        m2: p.m2,
        rooms: p.rooms,
        hasTerrace: p.hasTerrace,
        hasElevator: p.hasElevator,
        floor: p.floor,
        yearBuilt: p.yearBuilt,
        hiddenPrice: false,
        dropCount: history?.dropCount ?? 0,
        dropTotalPct: history?.dropTotalPct ?? 0,
        daysObservedByLince,
        daysSinceLastDrop: history?.daysSinceLastDrop ?? null,
      });

      if (facts.discountScore === null) {
        unscoredNoMedian += 1;
        if (opts.dryRun) continue;
        // Limpiamos cualquier score viejo que pudiera quedar — la honestidad
        // del valuator dice "sin mediana, sin score".
        await prisma.property.update({
          where: { id: p.id },
          data: {
            opportunityScore: null,
            zoneAvgPricePerM2: bucketStats?.medianEurM2 ?? null,
          },
        });
        continue;
      }

      scored += 1;
      if (opts.dryRun) continue;
      await prisma.property.update({
        where: { id: p.id },
        data: {
          opportunityScore: facts.discountScore,
          zoneAvgPricePerM2: bucketStats?.medianEurM2 ?? null,
        },
      });
    }

    console.log(
      `[score-properties] evaluadas=${properties.length} con_score=${scored} sin_mediana=${unscoredNoMedian} sin_precio=${unscoredMissingPrice} ${opts.dryRun ? '(DRY)' : ''}`,
    );

    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status,
      propertiesFound: properties.length,
      propertiesNew: scored,
      propertiesUpdated: scored,
      errors,
    });

    return {
      runId: run.id,
      status,
      totalEvaluated: properties.length,
      scored,
      unscoredNoMedian,
      unscoredMissingPrice,
      durationMs: Date.now() - startedAt.getTime(),
    };
  } catch (err) {
    status = 'error';
    errors.push({
      message: err instanceof Error ? err.message : String(err),
      at: new Date().toISOString(),
    });
    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status,
      propertiesFound: 0,
      propertiesNew: 0,
      propertiesUpdated: 0,
      errors,
    });
    throw err;
  }
}
