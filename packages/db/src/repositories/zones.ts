// CRUD de zonas + query de propiedades que matchean una zona.
//
// Una zona tiene filtros (postalCodes, minScore, maxPrice, types, minRooms)
// y canales de alerta. `findMatchingProperties` aplica los filtros sobre la
// tabla properties para obtener qué propiedades activas matchean.

import { Prisma, prisma } from '../index';

export interface ZoneInput {
  agencyId: string;
  name: string;
  postalCodes: string[];
  filters: {
    minScore?: number | null;
    maxPrice?: number | null;
    types?: string[] | null;
    minRooms?: number | null;
  };
  alertChannels: string[];
  alertPhoneE164?: string | null;
  alertEmail?: string | null;
  active?: boolean;
}

export async function createZone(input: ZoneInput): Promise<{ id: string }> {
  const row = await prisma.zone.create({
    data: {
      agencyId: input.agencyId,
      name: input.name,
      postalCodes: input.postalCodes,
      filters: input.filters as Prisma.InputJsonValue,
      alertChannels: input.alertChannels,
      alertPhoneE164: input.alertPhoneE164 ?? null,
      alertEmail: input.alertEmail ?? null,
      active: input.active ?? true,
    },
    select: { id: true },
  });
  return row;
}

export async function updateZone(id: string, input: Partial<ZoneInput>): Promise<void> {
  await prisma.zone.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.postalCodes !== undefined ? { postalCodes: input.postalCodes } : {}),
      ...(input.filters !== undefined ? { filters: input.filters as Prisma.InputJsonValue } : {}),
      ...(input.alertChannels !== undefined ? { alertChannels: input.alertChannels } : {}),
      ...(input.alertPhoneE164 !== undefined ? { alertPhoneE164: input.alertPhoneE164 } : {}),
      ...(input.alertEmail !== undefined ? { alertEmail: input.alertEmail } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteZone(id: string): Promise<void> {
  await prisma.zone.delete({ where: { id } });
}

export async function listZonesForAgency(agencyId: string) {
  return prisma.zone.findMany({
    where: { agencyId },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listActiveZones() {
  return prisma.zone.findMany({ where: { active: true } });
}

export async function getZoneById(id: string) {
  return prisma.zone.findUnique({ where: { id } });
}

/**
 * Devuelve los IDs de propiedades que matchean los filtros de la zona.
 * Solo considera propiedades activas (no vendidas/retiradas).
 *
 * `since`: si se pasa, solo devuelve propiedades vistas por primera vez después
 * de esa fecha (útil para "qué hay nuevo desde el último run").
 */
export async function findMatchingPropertyIds(zoneId: string, since?: Date): Promise<string[]> {
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone || !zone.active) return [];

  const filters = (zone.filters ?? {}) as {
    minScore?: number | null;
    maxPrice?: number | null;
    types?: string[] | null;
    minRooms?: number | null;
  };

  const where: Prisma.PropertyWhereInput = {};
  if (zone.postalCodes && zone.postalCodes.length > 0) {
    where.postalCode = { in: zone.postalCodes };
  }
  if (filters.maxPrice != null) {
    where.price = { lte: filters.maxPrice };
  }
  if (filters.minRooms != null) {
    where.rooms = { gte: filters.minRooms };
  }
  if (filters.types && filters.types.length > 0) {
    where.type = { in: filters.types };
  }
  if (since) {
    where.firstSeen = { gte: since };
  }
  // No filtramos por status para no excluir BOE (status='auction').
  // Sí podemos descartar 'sold' / 'withdrawn' en el futuro.

  const rows = await prisma.property.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Devuelve propiedades cuyo precio ha bajado al menos `minDropPct` (ej. 0.05
 * = 5%) en `lookbackDays` días, dentro de los filtros de la zona.
 * Usado por el trigger `price_drop`.
 */
export async function findPriceDropMatches(
  zoneId: string,
  lookbackDays = 14,
  minDropPct = 0.05,
): Promise<string[]> {
  const matching = new Set(await findMatchingPropertyIds(zoneId));
  if (matching.size === 0) return [];

  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  const drops = await prisma.priceHistory.findMany({
    where: {
      observedAt: { gte: cutoff },
      deltaPct: { lt: -minDropPct * 100 }, // deltaPct en %, queremos bajadas
      propertyId: { in: Array.from(matching) },
    },
    select: { propertyId: true },
    distinct: ['propertyId'],
  });
  return drops.map((d) => d.propertyId);
}
