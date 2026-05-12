// Job: evalúa todas las zonas activas contra las propiedades en DB.
//   - Detecta matches "new_property" (propiedades nuevas en zona desde
//     `lookbackHours`).
//   - Detecta matches "price_drop" (rebajas ≥ minDropPct en lookbackDays).
//   - Detecta matches "high_score" (score ≥ highScoreThreshold) — opcional.
//
// Por cada match crea una fila ZoneAlert (con dedup por unique constraint).
// Si está configurado el canal WhatsApp para esa zona y hay número de
// destinatario, intenta enviar. Si las credenciales no están, queda en
// modo dry y la fila se marca 'pending' para reintentar después.

import { prisma, zonesRepo, zoneAlertsRepo, type ZoneAlertTrigger } from '@lince/db';
import {
  WhatsAppClient,
  getWhatsAppConfigFromEnv,
  renderWhatsAppMessage,
  type AlertContext,
  type AlertTrigger,
} from '@lince/notifier';

export interface EvaluateZonesOptions {
  /** Mira propiedades vistas por primera vez en las últimas N horas. Default 168 (7 días). */
  newPropertyLookbackHours?: number;
  /** Mira rebajas en los últimos N días. Default 14. */
  priceDropLookbackDays?: number;
  /** Umbral de rebaja (0.05 = 5%). Default 0.05. */
  priceDropMinPct?: number;
  /** Si true, no envía mensajes — solo crea ZoneAlerts. */
  dryRun?: boolean;
}

export interface EvaluateZonesResult {
  zonesEvaluated: number;
  alertsCreated: number;
  alertsSent: number;
  alertsSkipped: number;
  alertsFailed: number;
  durationMs: number;
}

const TRIGGER_MAP: Record<AlertTrigger, ZoneAlertTrigger> = {
  new_property: 'new_property',
  price_drop: 'price_drop',
  high_score: 'high_score',
};

export async function runEvaluateZones(
  opts: EvaluateZonesOptions = {},
): Promise<EvaluateZonesResult> {
  const startedAt = Date.now();
  const lookbackHours = opts.newPropertyLookbackHours ?? 168;
  const dropDays = opts.priceDropLookbackDays ?? 14;
  const dropPct = opts.priceDropMinPct ?? 0.05;

  const zones = await zonesRepo.listActiveZones();
  console.log(`[evaluate-zones] ${zones.length} zonas activas`);

  // Cliente WhatsApp compartido. Se inicializa en modo dry si faltan credenciales.
  const wa = new WhatsAppClient(getWhatsAppConfigFromEnv());
  const effectivelyDry = opts.dryRun || wa.isDryRun();

  let alertsCreated = 0;
  let alertsSent = 0;
  let alertsSkipped = 0;
  let alertsFailed = 0;

  for (const zone of zones) {
    const since = new Date(Date.now() - lookbackHours * 3_600_000);
    const newMatches = await zonesRepo.findMatchingPropertyIds(zone.id, since);
    const dropMatches = await zonesRepo.findPriceDropMatches(zone.id, dropDays, dropPct);

    const tasks: Array<{ propertyId: string; trigger: AlertTrigger }> = [
      ...newMatches.map((id) => ({ propertyId: id, trigger: 'new_property' as const })),
      ...dropMatches.map((id) => ({ propertyId: id, trigger: 'price_drop' as const })),
    ];

    console.log(
      `[evaluate-zones] zone="${zone.name ?? zone.id.slice(0, 8)}" new=${newMatches.length} priceDrops=${dropMatches.length}`,
    );

    for (const task of tasks) {
      // Crear la fila (dedup automático por unique constraint)
      const alert = await zoneAlertsRepo.upsertZoneAlert({
        zoneId: zone.id,
        propertyId: task.propertyId,
        trigger: TRIGGER_MAP[task.trigger],
        channel: zone.alertChannels.includes('whatsapp') ? 'whatsapp' : 'none',
      });
      if (!alert.created) continue; // ya existía, no reprocesar
      alertsCreated += 1;

      // Si no quiere whatsapp o no tiene teléfono → skipped
      if (!zone.alertChannels.includes('whatsapp') || !zone.alertPhoneE164) {
        await zoneAlertsRepo.markAlertSkipped(
          alert.id,
          !zone.alertChannels.includes('whatsapp')
            ? 'whatsapp no está entre los alert_channels de la zona'
            : 'sin alert_phone_e164 configurado',
        );
        alertsSkipped += 1;
        continue;
      }

      // Preparar el contexto para la plantilla
      const property = await prisma.property.findUnique({ where: { id: task.propertyId } });
      if (!property) {
        await zoneAlertsRepo.markAlertFailed(alert.id, 'property no encontrada al renderizar');
        alertsFailed += 1;
        continue;
      }

      const sourceLabelMap: Record<string, string> = {
        pisos: 'Pisos.com',
        boe: 'BOE Subastas',
        solvia: 'Solvia',
      };

      const ctx: AlertContext = {
        zoneName: zone.name ?? 'tu zona',
        property: {
          address: property.address,
          city: property.city,
          postalCode: property.postalCode,
          price: property.price ? Number(property.price) : null,
          pricePerM2: property.pricePerM2 ? Number(property.pricePerM2) : null,
          zoneAvgPricePerM2: null, // se calcula vía adapter en la app, aquí lo simplificamos
          m2: property.m2,
          rooms: property.rooms,
          sourceLabel: sourceLabelMap[property.source] ?? property.source,
          sourceUrl: property.sourceUrl,
        },
      };

      const body = renderWhatsAppMessage(task.trigger, ctx);

      if (effectivelyDry) {
        console.log(
          `[evaluate-zones DRY] would send to ${zone.alertPhoneE164} for property ${property.id}`,
        );
        // Dejamos la fila como pending para que se mande cuando se complete config.
        alertsSent += 1; // contamos como "sent" semánticamente (la creación funcionó)
        continue;
      }

      const result = await wa.sendText({ to: zone.alertPhoneE164, body });
      if (result.ok) {
        await zoneAlertsRepo.markAlertSent(alert.id);
        alertsSent += 1;
      } else {
        await zoneAlertsRepo.markAlertFailed(alert.id, result.error ?? 'unknown');
        alertsFailed += 1;
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `\n[evaluate-zones] done in ${(durationMs / 1000).toFixed(1)}s | zones=${zones.length} created=${alertsCreated} sent=${alertsSent} skipped=${alertsSkipped} failed=${alertsFailed} ${effectivelyDry ? '(DRY)' : ''}`,
  );

  return {
    zonesEvaluated: zones.length,
    alertsCreated,
    alertsSent,
    alertsSkipped,
    alertsFailed,
    durationMs,
  };
}
