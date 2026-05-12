// CRM personal del inversor: marcar propiedades, notas, status, oferta máxima.

import { Prisma, prisma, type PropertyTrackStatus } from '../index';

export interface UpsertTrackInput {
  agencyId: string;
  propertyId: string;
  status?: PropertyTrackStatus;
  notes?: string | null;
  targetPriceEur?: number | null;
  contactedAt?: Date | null;
  viewedAt?: Date | null;
}

export async function upsertTrack(input: UpsertTrackInput) {
  return prisma.propertyTrack.upsert({
    where: {
      agencyId_propertyId: { agencyId: input.agencyId, propertyId: input.propertyId },
    },
    create: {
      agencyId: input.agencyId,
      propertyId: input.propertyId,
      status: input.status ?? 'watching',
      notes: input.notes ?? null,
      targetPriceEur:
        input.targetPriceEur != null ? new Prisma.Decimal(input.targetPriceEur) : null,
      contactedAt: input.contactedAt ?? null,
      viewedAt: input.viewedAt ?? null,
    },
    update: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.targetPriceEur !== undefined
        ? {
            targetPriceEur:
              input.targetPriceEur != null ? new Prisma.Decimal(input.targetPriceEur) : null,
          }
        : {}),
      ...(input.contactedAt !== undefined ? { contactedAt: input.contactedAt } : {}),
      ...(input.viewedAt !== undefined ? { viewedAt: input.viewedAt } : {}),
    },
  });
}

export async function removeTrack(agencyId: string, propertyId: string): Promise<void> {
  await prisma.propertyTrack
    .delete({ where: { agencyId_propertyId: { agencyId, propertyId } } })
    .catch(() => null); // no falla si no existe
}

export async function getTrack(agencyId: string, propertyId: string) {
  return prisma.propertyTrack.findUnique({
    where: { agencyId_propertyId: { agencyId, propertyId } },
  });
}

export async function listTracksForAgency(agencyId: string) {
  return prisma.propertyTrack.findMany({
    where: { agencyId },
    orderBy: { updatedAt: 'desc' },
  });
}

/** Map { propertyId → track } para enriquecer listados de Property. */
export async function getTracksMap(
  agencyId: string,
  propertyIds: string[],
): Promise<Map<string, Awaited<ReturnType<typeof listTracksForAgency>>[number]>> {
  if (propertyIds.length === 0) return new Map();
  const rows = await prisma.propertyTrack.findMany({
    where: { agencyId, propertyId: { in: propertyIds } },
  });
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) map.set(r.propertyId, r);
  return map;
}

/** Para el sidebar / dashboard: conteo por status. */
export async function getTrackStatusCounts(agencyId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string; n: bigint }>>(
    `SELECT status::text, COUNT(*)::bigint AS n
     FROM property_tracks
     WHERE agency_id = $1::uuid
     GROUP BY status`,
    agencyId,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
