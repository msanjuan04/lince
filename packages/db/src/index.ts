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

// Re-exports de tipos para uso top-level desde consumidores.
export type { PropertyUpsertInput, UpsertResult } from './repositories/properties';
export type { ErrorRecord, FinishRunInput } from './repositories/crawler-runs';
export type { ZoneInput } from './repositories/zones';
export type { CreateZoneAlertInput } from './repositories/zone-alerts';
export type { UpsertTrackInput } from './repositories/tracking';
