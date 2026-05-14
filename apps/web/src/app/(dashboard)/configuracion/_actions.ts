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

export interface JobRunSummary {
  source: string;
  status: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  propertiesFound: number | null;
  propertiesNew: number | null;
  propertiesUpdated: number | null;
  errorsCount: number;
}

export interface SystemStatus {
  db: 'ok' | 'fail';
  whatsappCredentialsPresent: boolean;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  telegramConfigured: boolean;
  anthropicConfigured: boolean;
  totalProperties: number;
  totalZones: number;
  totalTracked: number;
  totalAlertsPending: number;
  totalAlertsSent: number;
  lastCrawlerRunAt: Date | null;
  lastCrawlerRunSource: string | null;
  /** Última ejecución conocida por cada job kind (pisos, boe, solvia, pulse-dispatch, etc). */
  jobsLastRun: JobRunSummary[];
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
  let jobsLastRun: JobRunSummary[] = [];

  try {
    const [props, zones, tracks, pending, sent, lastRun, latestPerSource] = await Promise.all([
      prisma.property.count(),
      prisma.zone.count(),
      prisma.propertyTrack.count(),
      prisma.zoneAlert.count({ where: { status: 'pending' } }),
      prisma.zoneAlert.count({ where: { status: 'sent' } }),
      prisma.crawlerRun.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { source: true, endedAt: true, startedAt: true },
      }),
      // Última ejecución conocida por cada source (groupBy + take 1 por grupo
      // no es trivial en Prisma; lo resolvemos con queryRaw simple).
      prisma.$queryRaw<
        Array<{
          source: string;
          status: string | null;
          started_at: Date | null;
          ended_at: Date | null;
          properties_found: number | null;
          properties_new: number | null;
          properties_updated: number | null;
          errors_count: number;
        }>
      >`
        WITH ranked AS (
          SELECT
            source,
            status,
            started_at,
            ended_at,
            properties_found,
            properties_new,
            properties_updated,
            COALESCE(jsonb_array_length(errors), 0) AS errors_count,
            ROW_NUMBER() OVER (PARTITION BY source ORDER BY started_at DESC) AS rn
          FROM crawler_runs
        )
        SELECT source, status, started_at, ended_at, properties_found, properties_new, properties_updated, errors_count
        FROM ranked
        WHERE rn = 1
        ORDER BY started_at DESC
      `,
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
    jobsLastRun = latestPerSource.map((r) => ({
      source: r.source,
      status: r.status,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      propertiesFound: r.properties_found,
      propertiesNew: r.properties_new,
      propertiesUpdated: r.properties_updated,
      errorsCount: Number(r.errors_count ?? 0),
    }));
  } catch {
    db = 'fail';
  }

  return {
    db,
    whatsappCredentialsPresent: !!getWhatsAppConfigFromEnv(),
    whatsappPhoneNumberId: process.env['WHATSAPP_PHONE_NUMBER_ID'] ?? null,
    whatsappBusinessAccountId: process.env['WHATSAPP_BUSINESS_ACCOUNT_ID'] ?? null,
    telegramConfigured: !!process.env['TELEGRAM_BOT_TOKEN'],
    anthropicConfigured: !!process.env['ANTHROPIC_API_KEY'],
    totalProperties,
    totalZones,
    totalTracked,
    totalAlertsPending,
    totalAlertsSent,
    lastCrawlerRunAt,
    lastCrawlerRunSource,
    jobsLastRun,
  };
}
