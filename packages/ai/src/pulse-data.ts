// Data loader del Agente Pulse: lee de la DB las propiedades top, calcula stats
// de zona, y empaqueta todo en el shape que consume el prompt.

import { prisma } from '@lince/db';
import type {
  PulsePropertyInput,
  PulseReportInput,
  PulseReaderRole,
  PulseZoneStats,
} from './prompts/pulse-agent';

export interface LoadPulseDataOptions {
  /** Cuántas propiedades mete en el informe. Default 10. El prompt usa max 5 en el "top" — el resto da contexto al panorama. */
  topN?: number;
  /** Rol del lector — afecta el bloque adaptado del informe. */
  readerRole: PulseReaderRole;
  /** CPs a cubrir. Si no se pasa, cubre todas las que tengan propiedades. */
  postalCodes?: string[];
  /** Fecha de cierre del informe (default: hoy). */
  weekEndDate?: Date;
}

/** Carga datos reales de la DB y construye el input completo del prompt. */
export async function loadPulseData(opts: LoadPulseDataOptions): Promise<PulseReportInput> {
  const topN = opts.topN ?? 10;
  const weekEnd = opts.weekEndDate ?? new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const where = {
    price: { not: null },
    m2: { not: null },
    ...(opts.postalCodes && opts.postalCodes.length > 0
      ? { postalCode: { in: opts.postalCodes } }
      : {}),
  };

  const properties = await prisma.property.findMany({
    where,
    orderBy: [{ opportunityScore: 'desc' }, { firstSeen: 'desc' }],
    take: topN,
  });

  const items: PulsePropertyInput[] = properties.map((p) => {
    const rawData = (p.rawData as Record<string, unknown> | null) ?? null;
    const estimatedMonthlyRent = extractMonthlyRent(p.source, rawData);
    const daysOnMarket = Math.max(
      0,
      Math.floor((weekEnd.getTime() - p.firstSeen.getTime()) / (1000 * 60 * 60 * 24)),
    );

    return {
      id: p.id,
      source: p.source,
      type: p.type,
      address: p.address,
      city: p.city,
      postalCode: p.postalCode,
      province: p.province,
      m2: p.m2,
      rooms: p.rooms,
      bathrooms: p.bathrooms,
      yearBuilt: p.yearBuilt,
      price: p.price ? Number(p.price) : null,
      pricePerM2: p.pricePerM2 ? Number(p.pricePerM2) : null,
      zoneAvgPricePerM2: p.zoneAvgPricePerM2 ? Number(p.zoneAvgPricePerM2) : null,
      opportunityScore: p.opportunityScore ? Number(p.opportunityScore) : null,
      description: p.description ? p.description.slice(0, 800) : null,
      condition: p.condition,
      hasTerrace: p.hasTerrace,
      hasElevator: p.hasElevator,
      floor: p.floor,
      orientation: p.orientation,
      isBankOwned: p.isBankOwned,
      isAuction: p.isAuction,
      auctionStartingPrice: p.auctionStartingPrice ? Number(p.auctionStartingPrice) : null,
      redFlags: p.redFlags ?? [],
      estimatedMonthlyRent,
      daysOnMarket,
      sourceUrl: p.sourceUrl ?? null,
      mainImageUrl: p.mainImageUrl ?? null,
    };
  });

  const zoneStats = await loadZoneStats(
    items.map((i) => i.postalCode).filter((cp): cp is string => !!cp),
  );

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    readerRole: opts.readerRole,
    properties: items,
    zoneStats,
  };
}

/** Mediana €/m² por CP (excluyendo subastas que sesgan a la baja). */
async function loadZoneStats(postalCodes: string[]): Promise<PulseZoneStats[]> {
  if (postalCodes.length === 0) return [];
  const unique = Array.from(new Set(postalCodes));

  // Una sola query agregada por CP. Postgres no tiene mediana nativa sin extensión —
  // usamos AVG para volúmenes bajos. Para >1000 props/CP migrar a PERCENTILE_CONT(0.5).
  const rows = await prisma.$queryRaw<
    Array<{
      postal_code: string;
      city: string | null;
      province: string | null;
      avg_price_per_m2: number;
      count: bigint;
    }>
  >`
    SELECT
      postal_code,
      MAX(city) AS city,
      MAX(province) AS province,
      AVG(price_per_m2)::float AS avg_price_per_m2,
      COUNT(*) AS count
    FROM properties
    WHERE postal_code = ANY(${unique})
      AND price_per_m2 IS NOT NULL
      AND COALESCE(is_auction, false) = false
    GROUP BY postal_code
    ORDER BY postal_code
  `;

  return rows.map((r) => ({
    postalCode: r.postal_code,
    city: r.city,
    province: r.province,
    avgPricePerM2: Number(r.avg_price_per_m2),
    propertyCount: Number(r.count),
  }));
}

/** Solvia expone `cuotaAlquiler` en `propertyBasicDetail`. Otras fuentes: null por ahora. */
function extractMonthlyRent(
  source: string,
  rawData: Record<string, unknown> | null,
): number | null {
  if (!rawData) return null;
  if (source === 'solvia') {
    const basic = (rawData.propertyBasicDetail ?? rawData) as Record<string, unknown> | undefined;
    const raw = basic?.cuotaAlquiler;
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}
