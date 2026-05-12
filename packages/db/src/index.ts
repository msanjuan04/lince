import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';

export * as propertiesRepo from './repositories/properties.js';
export * as crawlerRunsRepo from './repositories/crawler-runs.js';

// Re-exports de tipos para uso top-level desde consumidores.
export type { PropertyUpsertInput, UpsertResult } from './repositories/properties.js';
export type { ErrorRecord, FinishRunInput } from './repositories/crawler-runs.js';
