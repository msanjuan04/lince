'use server';

import { revalidatePath } from 'next/cache';
import { prisma, zoneAlertsRepo } from '@lince/db';
import { WhatsAppClient, getWhatsAppConfigFromEnv, renderWhatsAppMessage } from '@lince/notifier';

type AlertTrigger = Parameters<typeof renderWhatsAppMessage>[0];
const TRIGGER_TO_TEMPLATE: Record<string, AlertTrigger> = {
  new_property: 'new_property',
  price_drop: 'price_drop',
  high_score: 'high_score',
};

export interface ResendAlertResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
}

export async function resendAlertAction(alertId: string): Promise<ResendAlertResult> {
  try {
    const alert = await prisma.zoneAlert.findUnique({
      where: { id: alertId },
      include: { zone: true },
    });
    if (!alert) return { ok: false, error: 'Alerta no encontrada' };
    if (!alert.zone.alertPhoneE164) {
      return { ok: false, error: 'La zona no tiene teléfono configurado.' };
    }
    const p = await prisma.property.findUnique({ where: { id: alert.propertyId } });
    if (!p) return { ok: false, error: 'Propiedad no encontrada' };
    const body = renderWhatsAppMessage(TRIGGER_TO_TEMPLATE[alert.trigger] ?? 'new_property', {
      zoneName: alert.zone.name ?? 'tu zona',
      property: {
        address: p.address,
        city: p.city,
        postalCode: p.postalCode,
        price: p.price ? Number(p.price) : null,
        pricePerM2: p.pricePerM2 ? Number(p.pricePerM2) : null,
        zoneAvgPricePerM2: null,
        m2: p.m2,
        rooms: p.rooms,
        sourceLabel: p.source,
        sourceUrl: p.sourceUrl,
      },
    });

    const client = new WhatsAppClient(getWhatsAppConfigFromEnv());
    const result = await client.sendText({ to: alert.zone.alertPhoneE164, body });
    if (result.ok) {
      await zoneAlertsRepo.markAlertSent(alertId);
    } else {
      await zoneAlertsRepo.markAlertFailed(alertId, result.error ?? 'unknown');
    }
    revalidatePath('/alertas');
    return { ok: result.ok, error: result.error, dryRun: result.dryRun };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function resetAlertAction(alertId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await zoneAlertsRepo.resetAlertToPending(alertId);
    revalidatePath('/alertas');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error' };
  }
}
