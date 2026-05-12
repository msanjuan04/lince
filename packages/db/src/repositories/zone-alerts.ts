// Auditoría de alertas de zona. Cada match dispara una fila aquí (con dedup
// por unique [zoneId, propertyId, trigger]). El notifier la marca como sent
// cuando confirma envío; o failed con el error si falla.

import { Prisma, prisma, type ZoneAlertTrigger, type ZoneAlertStatus } from '../index';

export interface CreateZoneAlertInput {
  zoneId: string;
  propertyId: string;
  trigger: ZoneAlertTrigger;
  channel: string;
  payload?: Prisma.InputJsonValue;
}

export async function upsertZoneAlert(input: CreateZoneAlertInput): Promise<{
  id: string;
  created: boolean;
  status: ZoneAlertStatus;
}> {
  try {
    const row = await prisma.zoneAlert.create({
      data: {
        zoneId: input.zoneId,
        propertyId: input.propertyId,
        trigger: input.trigger,
        channel: input.channel,
        payload: input.payload ?? Prisma.JsonNull,
        status: 'pending',
      },
      select: { id: true, status: true },
    });
    return { id: row.id, created: true, status: row.status };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.zoneAlert.findFirst({
        where: {
          zoneId: input.zoneId,
          propertyId: input.propertyId,
          trigger: input.trigger,
        },
        select: { id: true, status: true },
      });
      if (existing) return { id: existing.id, created: false, status: existing.status };
    }
    throw err;
  }
}

export async function markAlertSent(id: string): Promise<void> {
  await prisma.zoneAlert.update({
    where: { id },
    data: { status: 'sent', sentAt: new Date() },
  });
}

export async function markAlertFailed(id: string, error: string): Promise<void> {
  await prisma.zoneAlert.update({
    where: { id },
    data: { status: 'failed', error: error.slice(0, 1000) },
  });
}

export async function markAlertSkipped(id: string, reason: string): Promise<void> {
  await prisma.zoneAlert.update({
    where: { id },
    data: { status: 'skipped', error: reason.slice(0, 500) },
  });
}

export async function resetAlertToPending(id: string): Promise<void> {
  await prisma.zoneAlert.update({
    where: { id },
    data: { status: 'pending', error: null },
  });
}

export async function listPendingAlerts(limit = 100) {
  return prisma.zoneAlert.findMany({
    where: { status: 'pending' },
    take: limit,
    orderBy: { createdAt: 'asc' },
    include: {
      zone: true,
    },
  });
}

export async function listAlertsForAgency(agencyId: string, limit = 200) {
  const alerts = await prisma.zoneAlert.findMany({
    where: { zone: { agencyId } },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { zone: true },
  });
  if (alerts.length === 0) return [];
  const propIds = Array.from(new Set(alerts.map((a) => a.propertyId)));
  const properties = await prisma.property.findMany({
    where: { id: { in: propIds } },
    select: {
      id: true,
      address: true,
      city: true,
      postalCode: true,
      price: true,
      sourceUrl: true,
    },
  });
  const byId = new Map(properties.map((p) => [p.id, p]));
  return alerts.map((a) => ({
    ...a,
    property: byId.get(a.propertyId) ?? {
      id: a.propertyId,
      address: null,
      city: null,
      postalCode: null,
      price: null,
      sourceUrl: null,
    },
  }));
}

export async function getAlertStatusCounts(agencyId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string; n: bigint }>>(
    `SELECT za.status::text, COUNT(*)::bigint AS n
     FROM zone_alerts za
     JOIN zones z ON z.id = za.zone_id
     WHERE z.agency_id = $1::uuid
     GROUP BY za.status`,
    agencyId,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
