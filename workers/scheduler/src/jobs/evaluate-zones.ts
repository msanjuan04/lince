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

import {
  prisma,
  zonesRepo,
  zoneAlertsRepo,
  priceHistorySummaryRepo,
  estimateSalePricePerM2FromReference,
  type ZoneAlertTrigger,
} from '@lince/db';
import {
  TelegramClient,
  WhatsAppClient,
  getTelegramConfigFromEnv,
  getWhatsAppConfigFromEnv,
  renderTelegramAlert,
  renderWhatsAppMessage,
  type AlertContext,
  type AlertTrigger,
} from '@lince/notifier';
import { computeFlipEstimate } from '@lince/ai';

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
  // Baremos del flip-estimator. Calibrables via env sin tocar código.
  const REFORM_EUR_M2 = Number(process.env['REFORM_EUR_M2'] ?? '600');

  const zones = await zonesRepo.listActiveZones();
  console.log(`[evaluate-zones] ${zones.length} zonas activas`);

  // Cliente WhatsApp (legacy) y Telegram (canal preferido para uso interno).
  // Ambos entran en modo dry si faltan credenciales. La decisión de qué canal
  // usar se hace por zona según `alertChannels`.
  const wa = new WhatsAppClient(getWhatsAppConfigFromEnv());
  const tg = new TelegramClient(getTelegramConfigFromEnv());
  const tgChatIds = parseTelegramChatIds(process.env['TELEGRAM_CHAT_IDS']);

  // Pre-cargar resumen de rebajas observadas por Lince — una sola query
  // agregada en lugar de N queries de price_history en el loop. Map por
  // propertyId con dropCount/dropTotalPct/daysSinceLastDrop.
  const priceHistorySummaries = await priceHistorySummaryRepo.getPriceHistorySummaryMap();

  let alertsCreated = 0;
  let alertsSent = 0;
  let alertsSkipped = 0;
  let alertsFailed = 0;

  for (const zone of zones) {
    const since = new Date(Date.now() - lookbackHours * 3_600_000);
    const newMatches = await zonesRepo.findMatchingPropertyIds(zone.id, since);
    const dropMatches = await zonesRepo.findPriceDropMatches(zone.id, dropDays, dropPct);

    // Dedup por propertyId: si una propiedad aparece en newMatches Y dropMatches
    // (ej. recién añadida con un precio ya rebajado), solo enviamos una alerta.
    // Preferimos price_drop porque incluye más información de contexto.
    const dropSet = new Set(dropMatches);
    const tasks: Array<{ propertyId: string; trigger: AlertTrigger }> = [
      ...newMatches
        .filter((id) => !dropSet.has(id))
        .map((id) => ({ propertyId: id, trigger: 'new_property' as const })),
      ...dropMatches.map((id) => ({ propertyId: id, trigger: 'price_drop' as const })),
    ];

    console.log(
      `[evaluate-zones] zone="${zone.name ?? zone.id.slice(0, 8)}" new=${newMatches.length} priceDrops=${dropMatches.length} tasks=${tasks.length}`,
    );

    for (const task of tasks) {
      // Decide canal: telegram preferido para uso interno, whatsapp legacy.
      const useTelegram = zone.alertChannels.includes('telegram');
      const useWhatsApp = !useTelegram && zone.alertChannels.includes('whatsapp');

      // Modo dry-run: no tocamos DB en absoluto. Hacemos el cómputo del margen
      // en memoria para reportar "would send / would skip" pero sin crear filas.
      if (opts.dryRun) {
        const property = await prisma.property.findUnique({
          where: { id: task.propertyId },
          select: {
            price: true,
            m2: true,
            postalCode: true,
            pricePerM2: true,
            zoneAvgPricePerM2: true,
          },
        });
        if (!property) continue;
        alertsCreated += 1;

        // Mismo gate de €/m² vs zona que en la rama real.
        const MIN_BELOW_ZONE_PCT = Number(process.env['MIN_BELOW_ZONE_PCT'] ?? '0.20');
        if (MIN_BELOW_ZONE_PCT > 0) {
          const zoneAvg = property.zoneAvgPricePerM2 ? Number(property.zoneAvgPricePerM2) : null;
          const propEurM2 = property.pricePerM2 ? Number(property.pricePerM2) : null;
          if (
            zoneAvg === null ||
            zoneAvg <= 0 ||
            propEurM2 === null ||
            propEurM2 <= 0 ||
            (zoneAvg - propEurM2) / zoneAvg < MIN_BELOW_ZONE_PCT
          ) {
            alertsSkipped += 1;
            continue;
          }
        }

        const expectedSale = estimateSalePricePerM2FromReference(property.postalCode, {
          useMaxPremium: true,
          safetyMarginPct: 0.1,
        });
        const fe = computeFlipEstimate({
          listPrice: property.price ? Number(property.price) : null,
          m2: property.m2,
          eurM2Reform: REFORM_EUR_M2,
          expectedSaleEurM2: expectedSale?.eurM2 ?? null,
          expectedSaleSource: expectedSale?.source ?? null,
          monthsToSell: 6,
          saleCommissionPct: 0.03,
        });
        const MIN = Number(process.env['FLIP_MIN_MARGIN_PCT'] ?? '0.18');
        if (fe.grossMarginPct !== null && fe.grossMarginPct < MIN) {
          alertsSkipped += 1;
        } else {
          alertsSent += 1;
        }
        continue;
      }

      // Crear la fila (dedup automático por unique constraint)
      const alert = await zoneAlertsRepo.upsertZoneAlert({
        zoneId: zone.id,
        propertyId: task.propertyId,
        trigger: TRIGGER_MAP[task.trigger],
        channel: useTelegram ? 'telegram' : useWhatsApp ? 'whatsapp' : 'none',
      });
      if (!alert.created) continue; // ya existía, no reprocesar
      alertsCreated += 1;

      // Si ningún canal soportado está configurado → skipped
      if (!useTelegram && !useWhatsApp) {
        await zoneAlertsRepo.markAlertSkipped(
          alert.id,
          'zona sin canal compatible (ni telegram ni whatsapp en alert_channels)',
        );
        alertsSkipped += 1;
        continue;
      }

      // Falta de destinatario por canal → skipped
      if (useTelegram && tgChatIds.length === 0) {
        await zoneAlertsRepo.markAlertSkipped(
          alert.id,
          'TELEGRAM_CHAT_IDS vacío (necesario para canal telegram)',
        );
        alertsSkipped += 1;
        continue;
      }
      if (useWhatsApp && !zone.alertPhoneE164) {
        await zoneAlertsRepo.markAlertSkipped(
          alert.id,
          'sin alert_phone_e164 configurado para canal whatsapp',
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
        servihabitat: 'Servihabitat (CaixaBank)',
        aliseda: 'Aliseda (Santander/SAREB)',
        altamira: 'Altamira (doValue)',
      };

      // Extraer descuento de rawData según la fuente (cada servicer guarda
      // sus campos con nombres distintos en rawData; aquí los unificamos).
      const raw = (property.rawData ?? {}) as Record<string, unknown>;
      const previousPrice =
        typeof raw.PrecioAnterior === 'number'
          ? raw.PrecioAnterior
          : typeof raw.precioAntes === 'number'
            ? raw.precioAntes
            : null;
      const discountPct =
        typeof raw.DescuentoPrecio === 'number' && raw.DescuentoPrecio > 0
          ? raw.DescuentoPrecio
          : null;

      // Margen flip estimado: reusa flip-estimator con baremos del contacto
      // (€/m² reforma a coste material). Si falta dato crítico (m² o referencia
      // de mercado), el helper devuelve null y la alerta lo omite — no inventa.
      const priceNum = property.price ? Number(property.price) : null;

      // GATE €/m² vs zona (filtro esencial pedido): solo alertamos propiedades
      // cuyo €/m² esté al menos MIN_BELOW_ZONE_PCT por debajo de la mediana €/m²
      // observada de su zona (zoneAvgPricePerM2, que calcula score-properties).
      // Sin ese dato de zona no podemos confirmar el descuento → saltamos: el
      // descuento vs zona ES la señal, no queremos ruido sin ella.
      const MIN_BELOW_ZONE_PCT = Number(process.env['MIN_BELOW_ZONE_PCT'] ?? '0.20');
      if (MIN_BELOW_ZONE_PCT > 0) {
        const zoneAvg = property.zoneAvgPricePerM2 ? Number(property.zoneAvgPricePerM2) : null;
        const propEurM2 = property.pricePerM2 ? Number(property.pricePerM2) : null;
        if (zoneAvg === null || zoneAvg <= 0 || propEurM2 === null || propEurM2 <= 0) {
          await zoneAlertsRepo.markAlertSkipped(
            alert.id,
            'sin €/m² de zona (zoneAvgPricePerM2) para evaluar el descuento',
          );
          alertsSkipped += 1;
          continue;
        }
        const belowPct = (zoneAvg - propEurM2) / zoneAvg;
        if (belowPct < MIN_BELOW_ZONE_PCT) {
          await zoneAlertsRepo.markAlertSkipped(
            alert.id,
            `€/m² solo ${(belowPct * 100).toFixed(0)}% bajo zona < umbral ${(MIN_BELOW_ZONE_PCT * 100).toFixed(0)}%`,
          );
          alertsSkipped += 1;
          continue;
        }
      }

      const expectedSale = estimateSalePricePerM2FromReference(property.postalCode, {
        useMaxPremium: true,
        safetyMarginPct: 0.1,
      });
      const flipEstimate = computeFlipEstimate({
        listPrice: priceNum,
        m2: property.m2,
        eurM2Reform: REFORM_EUR_M2,
        expectedSaleEurM2: expectedSale?.eurM2 ?? null,
        expectedSaleSource: expectedSale?.source ?? null,
        monthsToSell: 6,
        saleCommissionPct: 0.03,
      });

      // GATE de margen: si tenemos estimación calculable y NO llega al umbral
      // mínimo, saltamos la alerta. Si no se puede calcular (faltan datos),
      // dejamos pasar — el usuario decide con los datos que sí hay. Política
      // explícita: mejor "no sé, te lo enseño" que "ruido por defecto".
      const MIN_FLIP_MARGIN_PCT = Number(process.env['FLIP_MIN_MARGIN_PCT'] ?? '0.18');
      if (
        flipEstimate.grossMarginPct !== null &&
        flipEstimate.grossMarginPct < MIN_FLIP_MARGIN_PCT
      ) {
        const pctStr = (flipEstimate.grossMarginPct * 100).toFixed(0);
        const thrStr = (MIN_FLIP_MARGIN_PCT * 100).toFixed(0);
        await zoneAlertsRepo.markAlertSkipped(
          alert.id,
          `margen flip estimado ${pctStr}% < umbral ${thrStr}%`,
        );
        alertsSkipped += 1;
        continue;
      }

      // Antigüedad: si la fuente expone fecha publicación (Aliseda: rawData
      // .operacion.FechaPublicacion, Solvia: rawData.operacion?), úsala. Si no,
      // proxy con firstSeen de Lince — etiqueta correctamente "Visto" vs "Publicado".
      const publicationDateRaw =
        (raw as Record<string, unknown>).FechaPublicacion ??
        ((raw as Record<string, unknown>).operacion as Record<string, unknown> | undefined)?.[
          'FechaPublicacion'
        ];
      let daysOnMarket: number | null = null;
      let daysOnMarketSource: 'source' | 'lince' | null = null;
      if (typeof publicationDateRaw === 'string' && publicationDateRaw.length >= 10) {
        const pubDate = new Date(publicationDateRaw);
        if (!isNaN(pubDate.getTime())) {
          daysOnMarket = Math.max(0, Math.floor((Date.now() - pubDate.getTime()) / 86_400_000));
          daysOnMarketSource = 'source';
        }
      }
      if (daysOnMarket === null && property.firstSeen) {
        daysOnMarket = Math.max(
          0,
          Math.floor((Date.now() - property.firstSeen.getTime()) / 86_400_000),
        );
        daysOnMarketSource = 'lince';
      }

      // Rebajas observadas — del map agregado pre-cargado.
      // Detectamos "fromSource" cuando la única (o más reciente) rebaja se
      // observó ≈ el mismo día que firstSeen → es la registrada-al-alta por
      // la fuente, no una observación de Lince entre runs.
      const historySum = priceHistorySummaries.get(property.id);
      let priceDrops: AlertContext['priceDrops'] = null;
      if (historySum && historySum.dropCount > 0) {
        const daysSinceFirstSeen = property.firstSeen
          ? Math.floor((Date.now() - property.firstSeen.getTime()) / 86_400_000)
          : null;
        const fromSource =
          historySum.dropCount === 1 &&
          daysSinceFirstSeen !== null &&
          historySum.daysSinceLastDrop !== null &&
          Math.abs(historySum.daysSinceLastDrop - daysSinceFirstSeen) <= 1;
        priceDrops = {
          count: historySum.dropCount,
          totalPct: historySum.dropTotalPct,
          daysSinceLast: historySum.daysSinceLastDrop,
          fromSource,
        };
      }

      const ctx: AlertContext = {
        zoneName: zone.name ?? 'tu zona',
        property: {
          address: property.address,
          city: property.city,
          postalCode: property.postalCode,
          price: priceNum,
          pricePerM2: property.pricePerM2 ? Number(property.pricePerM2) : null,
          zoneAvgPricePerM2: property.zoneAvgPricePerM2 ? Number(property.zoneAvgPricePerM2) : null,
          m2: property.m2,
          rooms: property.rooms,
          sourceLabel: sourceLabelMap[property.source] ?? property.source,
          sourceUrl: property.sourceUrl,
          mainImageUrl: property.mainImageUrl,
          previousPrice,
          discountPct,
          cadastralRef: property.cadastralRef,
          catastro: (() => {
            const c = (raw.catastro ?? null) as {
              yearBuilt?: number | null;
              surfaceM2?: number | null;
              use?: string | null;
            } | null;
            if (!c) return null;
            return {
              yearBuilt: typeof c.yearBuilt === 'number' ? c.yearBuilt : null,
              surfaceM2: typeof c.surfaceM2 === 'number' ? c.surfaceM2 : null,
              use: typeof c.use === 'string' ? c.use : null,
            };
          })(),
        },
        flipMarginPct: flipEstimate.grossMarginPct,
        flipMarginEur: flipEstimate.grossMarginEur,
        daysOnMarket,
        daysOnMarketSource,
        priceDrops,
      };

      if (useTelegram) {
        const html = renderTelegramAlert(task.trigger, ctx);
        const photoUrl = ctx.property.mainImageUrl;

        // Contamos éxito como "al menos UN chat recibió". Antes contaba como
        // failed si UNO fallaba aunque otros recibieran — bug que ensuciaba el
        // reporte y bloqueaba contadores de sent.
        //
        // Fallback foto → texto: si la URL de imagen no es válida para Telegram
        // (caso típico: BOE/Pisos con URL relativa o redirect a HTML), reintenta
        // sin foto. Mejor recibir el texto sin foto que perder la alerta.
        let anyDelivered = false;
        let lastError: string | undefined;
        for (const chatId of tgChatIds) {
          let r = photoUrl
            ? await tg.sendPhoto({
                chatId,
                photoUrl,
                caption: html,
                parseMode: 'HTML',
              })
            : await tg.sendMessage({
                chatId,
                text: html,
                parseMode: 'HTML',
                disableWebPagePreview: false,
              });
          if (
            !r.ok &&
            photoUrl &&
            r.error &&
            /wrong type of the web page content|wrong file identifier|failed to get http url content|PHOTO_INVALID/i.test(
              r.error,
            )
          ) {
            r = await tg.sendMessage({
              chatId,
              text: html,
              parseMode: 'HTML',
              disableWebPagePreview: false,
            });
          }
          if (r.ok) anyDelivered = true;
          else lastError = r.error;
        }
        if (anyDelivered) {
          await zoneAlertsRepo.markAlertSent(alert.id);
          alertsSent += 1;
        } else {
          await zoneAlertsRepo.markAlertFailed(alert.id, lastError ?? 'unknown');
          alertsFailed += 1;
        }
      } else {
        // useWhatsApp por descarte (no entramos aquí si ambos canales están).
        const body = renderWhatsAppMessage(task.trigger, ctx);
        const result = await wa.sendText({ to: zone.alertPhoneE164!, body });
        if (result.ok) {
          await zoneAlertsRepo.markAlertSent(alert.id);
          alertsSent += 1;
        } else {
          await zoneAlertsRepo.markAlertFailed(alert.id, result.error ?? 'unknown');
          alertsFailed += 1;
        }
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `\n[evaluate-zones] done in ${(durationMs / 1000).toFixed(1)}s | zones=${zones.length} created=${alertsCreated} sent=${alertsSent} skipped=${alertsSkipped} failed=${alertsFailed} ${opts.dryRun ? '(DRY)' : ''}`,
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

function parseTelegramChatIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
