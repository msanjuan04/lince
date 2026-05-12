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

/**
 * Crea una fila de alerta. Si ya existe (mismo trigger para misma propiedad
 * en la misma zona) la devuelve sin duplicar — el unique constraint hace el
 * dedup en DB. Devuelve `created: true` cuando es nueva.
 */
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
    // Unique violation → ya existe
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
