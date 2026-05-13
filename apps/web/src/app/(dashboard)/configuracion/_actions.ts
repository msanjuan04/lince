'use server';

import { prisma } from '@lince/db';
import {
  WhatsAppClient,
  getWhatsAppConfigFromEnv,
  normalizeE164,
  renderWhatsAppMessage,
} from '@lince/notifier';

export interface TestWhatsAppResult {
  ok: boolean;
  dryRun: boolean;
  error?: string;
  messageId?: string;
  to?: string;
}

/**
 * Envía un mensaje de prueba al número que se pase, o al primero que
 * encuentre con alertPhoneE164 configurado en alguna zona.
 *
 * Si las credenciales WhatsApp no están en env, devuelve dryRun=true y
 * loggea el mensaje en lugar de enviarlo.
 */
export async function testWhatsAppAction(phoneRaw: string): Promise<TestWhatsAppResult> {
  const to = normalizeE164(phoneRaw);
  if (!to) {
    return {
      ok: false,
      dryRun: false,
      error: 'Número inválido. Formato ES: 666 12 34 56 o +34 ...',
    };
  }
  const body =
    'Test de Lince Pulse — si recibes este mensaje, las credenciales WhatsApp Business están bien configuradas. — Lince';

  // También probamos el template render con datos sintéticos
  const previewSample = renderWhatsAppMessage('new_property', {
    zoneName: 'BCN Eixample',
    property: {
      address: 'C/ Aribau 87, 3º 2ª',
      city: 'Barcelona',
      postalCode: '08015',
      price: 280_000,
      pricePerM2: 4923,
      zoneAvgPricePerM2: 5600,
      m2: 57,
      rooms: 2,
      sourceLabel: 'Pisos.com',
      sourceUrl: 'https://www.pisos.com/comprar/piso-ejemplo-12345_67890/',
    },
  });

  const config = getWhatsAppConfigFromEnv();
  const client = new WhatsAppClient(config);
  const result = await client.sendText({
    to,
    body: `${body}\n\n— preview de un trigger real —\n\n${previewSample}`,
  });
  return {
    ok: result.ok,
    dryRun: result.dryRun,
    error: result.error,
    messageId: result.messageId,
    to,
  };
}

export interface SystemStatus {
  db: 'ok' | 'fail';
  whatsappCredentialsPresent: boolean;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  totalProperties: number;
  totalZones: number;
  totalTracked: number;
  totalAlertsPending: number;
  totalAlertsSent: number;
  lastCrawlerRunAt: Date | null;
  lastCrawlerRunSource: string | null;
}

export async function getSystemStatusAction(): Promise<SystemStatus> {
  let db: 'ok' | 'fail' = 'ok';
  let totalProperties = 0;
  let totalZones = 0;
  let totalTracked = 0;
  let totalAlertsPending = 0;
  let totalAlertsSent = 0;
  let lastCrawlerRunAt: Date | null = null;
  let lastCrawlerRunSource: string | null = null;

  try {
    const [props, zones, tracks, pending, sent, lastRun] = await Promise.all([
      prisma.property.count(),
      prisma.zone.count(),
      prisma.propertyTrack.count(),
      prisma.zoneAlert.count({ where: { status: 'pending' } }),
      prisma.zoneAlert.count({ where: { status: 'sent' } }),
      prisma.crawlerRun.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { source: true, endedAt: true, startedAt: true },
      }),
    ]);
    totalProperties = props;
    totalZones = zones;
    totalTracked = tracks;
    totalAlertsPending = pending;
    totalAlertsSent = sent;
    if (lastRun) {
      lastCrawlerRunAt = lastRun.endedAt ?? lastRun.startedAt;
      lastCrawlerRunSource = lastRun.source;
    }
  } catch {
    db = 'fail';
  }

  return {
    db,
    whatsappCredentialsPresent: !!getWhatsAppConfigFromEnv(),
    whatsappPhoneNumberId: process.env['WHATSAPP_PHONE_NUMBER_ID'] ?? null,
    whatsappBusinessAccountId: process.env['WHATSAPP_BUSINESS_ACCOUNT_ID'] ?? null,
    totalProperties,
    totalZones,
    totalTracked,
    totalAlertsPending,
    totalAlertsSent,
    lastCrawlerRunAt,
    lastCrawlerRunSource,
  };
}
