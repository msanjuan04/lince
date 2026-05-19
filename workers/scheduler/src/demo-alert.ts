// Demo puntual: manda UNA alerta de prueba a Telegram con el formato enriquecido
// (foto, descuento, margen flip, fecha publicación real, rebaja registrada
// por la fuente). NO toca la tabla zone_alerts — solo envía el mensaje para que
// el usuario vea cómo serán las alertas a partir de ahora.
//
// Uso:
//   pnpm --filter @lince/scheduler exec tsx src/demo-alert.ts <propertyId>

import { prisma, priceHistorySummaryRepo, estimateSalePricePerM2FromReference } from '@lince/db';
import {
  TelegramClient,
  getTelegramConfigFromEnv,
  renderTelegramAlert,
  type AlertContext,
} from '@lince/notifier';
import { computeFlipEstimate } from '@lince/ai';

async function main(): Promise<void> {
  const propertyId = process.argv[2];
  if (!propertyId) {
    console.error('Uso: tsx src/demo-alert.ts <propertyId>');
    process.exit(2);
  }

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    console.error(`Property ${propertyId} no encontrada`);
    process.exit(1);
  }

  // Mismo cómputo que evaluate-zones — duplicado a propósito para no acoplar.
  const raw = (property.rawData ?? {}) as Record<string, unknown>;
  const previousPrice =
    typeof raw.PrecioAnterior === 'number'
      ? raw.PrecioAnterior
      : typeof raw.precioAntes === 'number'
        ? raw.precioAntes
        : null;
  const discountPct =
    typeof raw.DescuentoPrecio === 'number' && raw.DescuentoPrecio > 0 ? raw.DescuentoPrecio : null;

  const priceNum = property.price ? Number(property.price) : null;
  const expectedSale = estimateSalePricePerM2FromReference(property.postalCode, {
    useMaxPremium: true,
    safetyMarginPct: 0.1,
  });
  const fe = computeFlipEstimate({
    listPrice: priceNum,
    m2: property.m2,
    eurM2Reform: 400,
    expectedSaleEurM2: expectedSale?.eurM2 ?? null,
    expectedSaleSource: expectedSale?.source ?? null,
    monthsToSell: 6,
    saleCommissionPct: 0.03,
  });

  const fechaPubRaw =
    (raw.FechaPublicacion as string | undefined) ??
    ((raw.operacion as Record<string, unknown> | undefined)?.FechaPublicacion as
      | string
      | undefined);
  let daysOnMarket: number | null = null;
  let daysOnMarketSource: 'source' | 'lince' | null = null;
  if (fechaPubRaw && fechaPubRaw.length >= 10) {
    const d = new Date(fechaPubRaw);
    if (!isNaN(d.getTime())) {
      daysOnMarket = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
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

  const historyMap = await priceHistorySummaryRepo.getPriceHistorySummaryMap();
  const historySum = historyMap.get(property.id);
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

  const sourceLabelMap: Record<string, string> = {
    pisos: 'Pisos.com',
    boe: 'BOE Subastas',
    solvia: 'Solvia',
    servihabitat: 'Servihabitat (CaixaBank)',
    aliseda: 'Aliseda (Santander/SAREB)',
  };

  const ctx: AlertContext = {
    zoneName: '[DEMO] Formato nuevo',
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
    flipMarginPct: fe.grossMarginPct,
    flipMarginEur: fe.grossMarginEur,
    daysOnMarket,
    daysOnMarketSource,
    priceDrops,
  };

  const html = renderTelegramAlert('new_property', ctx);
  console.log('--- HTML que se va a enviar ---');
  console.log(html);
  console.log('--- fin HTML ---');

  const tg = new TelegramClient(getTelegramConfigFromEnv());
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chatId of chatIds) {
    const r = property.mainImageUrl
      ? await tg.sendPhoto({
          chatId,
          photoUrl: property.mainImageUrl,
          caption: html,
          parseMode: 'HTML',
        })
      : await tg.sendMessage({
          chatId,
          text: html,
          parseMode: 'HTML',
          disableWebPagePreview: false,
        });
    console.log(`chat ${chatId}: ${r.ok ? 'OK' : 'FAIL'} ${r.error ?? ''}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
