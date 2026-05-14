import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';

export * as propertiesRepo from './repositories/properties';
export * as crawlerRunsRepo from './repositories/crawler-runs';
export * as zonesRepo from './repositories/zones';
export * as zoneAlertsRepo from './repositories/zone-alerts';
export * as trackingRepo from './repositories/tracking';
export * as pulseReportsRepo from './repositories/pulse-reports';
export * as zoneStatsRepo from './repositories/zone-stats';
export * as priceHistorySummaryRepo from './repositories/price-history-summary';
export * as sellerPressureRepo from './repositories/seller-pressure';
export * as absorptionRepo from './repositories/absorption';
export * as visualAnalysesRepo from './repositories/visual-analyses';

// Re-exports de tipos para uso top-level desde consumidores.
export type { PropertyUpsertInput, UpsertResult } from './repositories/properties';
export type { ErrorRecord, FinishRunInput } from './repositories/crawler-runs';
export type { ZoneInput } from './repositories/zones';
export type { CreateZoneAlertInput } from './repositories/zone-alerts';
export type { UpsertTrackInput } from './repositories/tracking';
export type { CreatePulseReportInput } from './repositories/pulse-reports';
export type { ZoneStats, BucketStats, Bucket } from './repositories/zone-stats';
export { bucketOf } from './repositories/zone-stats';
export type { PriceHistorySummary } from './repositories/price-history-summary';
export type { SellerPressureStats } from './repositories/seller-pressure';
export { pressureKey } from './repositories/seller-pressure';
export type { AbsorptionStat } from './repositories/absorption';
export { absorptionKey } from './repositories/absorption';
export { weekStartUTC } from './repositories/pulse-reports';

// Market reference dataset (informe externo, fuente: Idealista/Indomio/etc abril 2026)
export {
  MARKET_REFERENCE_2026Q2,
  MARKET_REFERENCE_DATE,
  getAllUniversePostalCodes,
  getReferenceByPostalCode,
  getAllReferencesByPostalCode,
  getReferencesByTier,
  estimateSalePricePerM2FromReference,
} from './data/market-reference-2026Q2';
export type { MarketReferenceEntry, Tier, Momentum } from './data/market-reference-2026Q2';
