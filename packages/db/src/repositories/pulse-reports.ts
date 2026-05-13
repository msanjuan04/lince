// Persistencia de informes Pulse generados por el agente Claude.
// Único por (agencyId, weekOf) — un informe por semana por agency. Si se
// regenera para la misma semana, sobrescribimos en lugar de duplicar.

import { Prisma, prisma } from '../index';

export interface CreatePulseReportInput {
  agencyId: string;
  weekOf: Date; // se normaliza a midnight UTC en el insert
  narrative: string | null;
  topOpportunities: unknown;
  inventorySnapshot?: unknown;
  modelId: string | null;
  promptVersion: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costEur: number | null;
  dryRun: boolean;
}

/** Lunes de la semana ISO en UTC (00:00). */
export function weekStartUTC(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getUTCDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function upsertPulseReport(input: CreatePulseReportInput) {
  const week = weekStartUTC(input.weekOf);
  return prisma.pulseReport.upsert({
    where: {
      agencyId_weekOf: { agencyId: input.agencyId, weekOf: week },
    },
    create: {
      agencyId: input.agencyId,
      weekOf: week,
      narrative: input.narrative,
      topOpportunities: input.topOpportunities as Prisma.InputJsonValue,
      inventorySnapshot: (input.inventorySnapshot ?? null) as Prisma.InputJsonValue,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costEur: input.costEur ? new Prisma.Decimal(input.costEur) : null,
      dryRun: input.dryRun,
    },
    update: {
      narrative: input.narrative,
      topOpportunities: input.topOpportunities as Prisma.InputJsonValue,
      inventorySnapshot: (input.inventorySnapshot ?? null) as Prisma.InputJsonValue,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costEur: input.costEur ? new Prisma.Decimal(input.costEur) : null,
      dryRun: input.dryRun,
    },
  });
}

export async function listPulseReportsForAgency(agencyId: string, take = 20) {
  return prisma.pulseReport.findMany({
    where: { agencyId },
    orderBy: { weekOf: 'desc' },
    take,
  });
}

export async function getLatestPulseReportForAgency(agencyId: string) {
  return prisma.pulseReport.findFirst({
    where: { agencyId },
    orderBy: { weekOf: 'desc' },
  });
}

export async function getPulseReportById(id: string) {
  return prisma.pulseReport.findUnique({ where: { id } });
}
