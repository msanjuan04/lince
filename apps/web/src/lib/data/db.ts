// Adaptador entre el cliente Prisma (@lince/db) y los tipos de UI.
//
// Política de honestidad (regla número 1 del producto):
//   - Si un dato no es real en la fuente, devolvemos `null`. Nunca inventamos.
//   - NO usamos centroide CP como fallback de lat/lng — un punto en el mapa
//     debe ser DONDE ESTÁ el inmueble.
//   - El score solo se calcula cuando hay muestra de zona suficiente (≥3
//     propiedades en el mismo CP, excluyendo subastas). Si no, null.
//   - El type, source y city tampoco tienen fallback inventado. Si no se
//     puede determinar, viene como null y la UI muestra `—`.

import { prisma, Prisma, type Property as PrismaProperty } from '@lince/db';
import type { PriceHistoryEntry, Property, PropertySource, PropertyType } from './types';

const VALID_SOURCES: PropertySource[] = [
  'idealista',
  'fotocasa',
  'habitaclia',
  'pisos',
  'boe',
  'sareb',
  'aliseda',
  'solvia',
  'haya',
  'casaktua',
  'anida',
];

const SOURCE_LABELS: Record<PropertySource, string> = {
  idealista: 'Idealista',
  fotocasa: 'Fotocasa',
  habitaclia: 'Habitaclia',
  pisos: 'Pisos.com',
  boe: 'BOE Subastas',
  sareb: 'SAREB',
  aliseda: 'Aliseda',
  solvia: 'Solvia',
  haya: 'Haya',
  casaktua: 'Casaktua',
  anida: 'Anida',
};

const VALID_TYPES: PropertyType[] = ['piso', 'casa', 'atico', 'duplex', 'local', 'terreno'];

const TYPE_ALIASES: Record<string, PropertyType> = {
  piso: 'piso',
  apartamento: 'piso',
  estudio: 'piso',
  casa: 'casa',
  chalet: 'casa',
  vivienda: 'casa',
  atico: 'atico',
  ático: 'atico',
  duplex: 'duplex',
  dúplex: 'duplex',
  local: 'local',
  comercial: 'local',
  oficina: 'local',
  nave: 'local',
  'nave industrial': 'local',
  terreno: 'terreno',
  suelo: 'terreno',
  finca: 'terreno',
  garaje: 'local',
  trastero: 'local',
};

const MIN_ZONE_SAMPLE = 3; // mínimo de propiedades en CP para considerar la media como referencia

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function mapType(raw: string | null): PropertyType | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  if (VALID_TYPES.includes(key as PropertyType)) return key as PropertyType;
  return null;
}

function mapSource(raw: string): { source: PropertySource; label: string } {
  if (VALID_SOURCES.includes(raw as PropertySource)) {
    const src = raw as PropertySource;
    return { source: src, label: SOURCE_LABELS[src] };
  }
  // Fuente desconocida: la marcamos pero no inventamos un nombre familiar.
  return { source: raw as PropertySource, label: raw };
}

function mapStatus(raw: string | null): Property['status'] {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r === 'active') return 'active';
  if (r === 'auction') return 'auction';
  if (r === 'sold') return 'sold';
  if (r === 'withdrawn') return 'withdrawn';
  return null;
}

/**
 * Devuelve, para cada CP en la DB, { avgEurM2, count }. Solo considera CPs
 * con al menos MIN_ZONE_SAMPLE propiedades (estadísticamente significativo).
 * Excluye subastas para no sesgar a la baja.
 */
async function getZoneStatsByCp(): Promise<Map<string, { avgEurM2: number; count: number }>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ postal_code: string; avg_eur_m2: number; n: bigint }>
  >(`
    SELECT postal_code,
           AVG(price_per_m2)::float AS avg_eur_m2,
           COUNT(*)::bigint AS n
    FROM properties
    WHERE postal_code IS NOT NULL
      AND price_per_m2 IS NOT NULL
      AND is_auction = false
    GROUP BY postal_code
  `);
  const map = new Map<string, { avgEurM2: number; count: number }>();
  for (const r of rows) {
    const n = Number(r.n);
    if (r.avg_eur_m2 > 500 && r.avg_eur_m2 < 20_000) {
      map.set(r.postal_code, { avgEurM2: Math.round(r.avg_eur_m2), count: n });
    }
  }
  return map;
}

/** Score heurístico: cuanto más por debajo de la mediana, mayor el score. */
function computeScore(pricePerM2: number, zoneAvg: number, isAuction: boolean): number {
  if (zoneAvg <= 0) return 0;
  const delta = (zoneAvg - pricePerM2) / zoneAvg;
  let score = clampScore(delta * 200);
  if (isAuction) score = clampScore(score + 15);
  return score;
}

/** Adaptador honesto Prisma → UI. */
function adapt(
  row: PrismaProperty,
  zoneStatsByCp: Map<string, { avgEurM2: number; count: number }>,
): Property {
  const { source, label } = mapSource(row.source);
  const pricePerM2 = row.pricePerM2 ? Number(row.pricePerM2) : null;
  const price = row.price ? Number(row.price) : null;
  const isAuction = row.isAuction === true;
  const postalCode = row.postalCode ?? null;

  // Zona: solo si hay muestra suficiente
  const zoneStat = postalCode ? zoneStatsByCp.get(postalCode) : undefined;
  const zoneAvgPricePerM2 =
    zoneStat && zoneStat.count >= MIN_ZONE_SAMPLE ? zoneStat.avgEurM2 : null;
  const zoneSampleSize = zoneStat?.count ?? 0;

  const zoneDeltaPct =
    pricePerM2 !== null && zoneAvgPricePerM2 !== null && zoneAvgPricePerM2 > 0
      ? (zoneAvgPricePerM2 - pricePerM2) / zoneAvgPricePerM2
      : null;

  const opportunityScore =
    pricePerM2 !== null && zoneAvgPricePerM2 !== null
      ? computeScore(pricePerM2, zoneAvgPricePerM2, isAuction)
      : null;

  return {
    id: row.id,
    source,
    sourceLabel: label,
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    type: mapType(row.type),
    address: row.address,
    city: row.city,
    postalCode,
    province: row.province,
    lat: row.lat, // null si la fuente no la expuso — NO inventamos
    lng: row.lng,
    cadastralRef: row.cadastralRef,
    m2: row.m2,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    yearBuilt: row.yearBuilt,
    price,
    pricePerM2,
    zoneAvgPricePerM2,
    zoneSampleSize,
    zoneDeltaPct,
    opportunityScore,
    status: mapStatus(row.status),
    isAuction,
    isBankOwned: row.isBankOwned === true,
    condition: row.condition,
    hasTerrace: row.hasTerrace,
    hasElevator: row.hasElevator,
    floor: row.floor,
    orientation: row.orientation,
    redFlags: row.redFlags ?? [],
    description: row.description,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
  };
}

// ----- Public queries -----

export interface DbOpportunityFilters {
  postalCodes?: string[];
  minScore?: number;
  maxPrice?: number;
  minRooms?: number;
  types?: PropertyType[];
  search?: string;
  origin?: 'auction' | 'bank_owned' | 'private' | null;
  excludeRedFlags?: boolean;
  onlyIds?: string[];
  sort?: 'score' | 'delta' | 'price_asc' | 'price_desc' | 'eurm2_asc' | 'new';
}

export async function fetchOpportunities(filters: DbOpportunityFilters = {}): Promise<Property[]> {
  const zoneStatsByCp = await getZoneStatsByCp();

  const where: Prisma.PropertyWhereInput = {};

  if (filters.postalCodes && filters.postalCodes.length > 0) {
    where.postalCode = { in: filters.postalCodes };
  }
  if (filters.maxPrice !== undefined) {
    where.price = { lte: filters.maxPrice };
  }
  if (filters.minRooms !== undefined) {
    where.rooms = { gte: filters.minRooms };
  }
  if (filters.search) {
    where.OR = [
      { address: { contains: filters.search, mode: 'insensitive' } },
      { city: { contains: filters.search, mode: 'insensitive' } },
      { postalCode: { contains: filters.search } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.origin === 'auction') {
    where.isAuction = true;
  } else if (filters.origin === 'bank_owned') {
    where.isBankOwned = true;
  } else if (filters.origin === 'private') {
    where.isAuction = false;
    where.isBankOwned = false;
  }
  if (filters.onlyIds && filters.onlyIds.length > 0) {
    where.id = { in: filters.onlyIds };
  }
  if (filters.excludeRedFlags) {
    where.redFlags = { isEmpty: true };
  }

  const rows = await prisma.property.findMany({
    where,
    orderBy: [{ lastSeen: 'desc' }],
    take: 500,
  });

  let adapted = rows.map((r) => adapt(r, zoneStatsByCp));

  if (filters.types && filters.types.length > 0) {
    const setT = new Set(filters.types);
    adapted = adapted.filter((p) => p.type !== null && setT.has(p.type));
  }
  if (filters.minScore !== undefined) {
    const min = filters.minScore;
    adapted = adapted.filter((p) => p.opportunityScore !== null && p.opportunityScore >= min);
  }

  // Sort según el criterio elegido.
  const sortBy = filters.sort ?? 'score';
  adapted.sort((a, b) => {
    switch (sortBy) {
      case 'delta': {
        const ad = a.zoneDeltaPct ?? -Infinity;
        const bd = b.zoneDeltaPct ?? -Infinity;
        return bd - ad;
      }
      case 'price_asc':
        return (a.price ?? Infinity) - (b.price ?? Infinity);
      case 'price_desc':
        return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      case 'eurm2_asc':
        return (a.pricePerM2 ?? Infinity) - (b.pricePerM2 ?? Infinity);
      case 'new':
        return b.firstSeen.getTime() - a.firstSeen.getTime();
      case 'score':
      default: {
        const aScore = a.opportunityScore ?? -1;
        const bScore = b.opportunityScore ?? -1;
        return bScore - aScore;
      }
    }
  });
  return adapted;
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  const zoneStatsByCp = await getZoneStatsByCp();
  const row = await prisma.property.findUnique({ where: { id } });
  return row ? adapt(row, zoneStatsByCp) : null;
}

export async function fetchPropertyHistory(propertyId: string): Promise<PriceHistoryEntry[]> {
  const rows = await prisma.priceHistory.findMany({
    where: { propertyId },
    orderBy: { observedAt: 'asc' },
  });
  return rows.map((r) => ({
    observedAt: r.observedAt,
    oldPrice: r.oldPrice ? Number(r.oldPrice) : null,
    newPrice: Number(r.newPrice),
    deltaPct: r.deltaPct ? Number(r.deltaPct) : null,
  }));
}

/** Top N oportunidades para el dashboard home. */
export async function fetchTopOpportunities(limit = 5): Promise<Property[]> {
  const all = await fetchOpportunities();
  return all.slice(0, limit);
}

/** Distribución de propiedades por fuente. */
export async function fetchSourceDistribution(): Promise<Array<{ source: string; count: number }>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ source: string; n: bigint }>>(
    `SELECT source, COUNT(*)::bigint AS n FROM properties GROUP BY source ORDER BY n DESC`,
  );
  return rows.map((r) => ({ source: r.source, count: Number(r.n) }));
}

export async function fetchBucketDistribution(): Promise<{
  auctions: number;
  bankOwned: number;
  needsReform: number;
  withTerrace: number;
  withRedFlags: number;
  highScore: number;
}> {
  const [auctions, bankOwned, needsReform, withTerrace] = await Promise.all([
    prisma.property.count({ where: { isAuction: true } }),
    prisma.property.count({ where: { isBankOwned: true } }),
    prisma.property.count({ where: { condition: 'needs_reform' } }),
    prisma.property.count({ where: { hasTerrace: true } }),
  ]);
  const redFlagsRows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::bigint AS n FROM properties WHERE array_length(red_flags, 1) > 0`,
  );
  const withRedFlags = Number(redFlagsRows[0]?.n ?? 0n);

  const all = await fetchOpportunities();
  const highScore = all.filter(
    (p) => p.opportunityScore !== null && p.opportunityScore >= 60,
  ).length;

  return { auctions, bankOwned, needsReform, withTerrace, withRedFlags, highScore };
}

/** Propiedades CON coordenadas reales (las que no las tienen no van al mapa). */
export async function fetchOpportunitiesForMap(): Promise<Property[]> {
  const all = await fetchOpportunities();
  return all.filter((p) => p.lat !== null && p.lng !== null);
}

/** Conteo de propiedades SIN geolocalización (para mostrar en leyenda del mapa). */
export async function fetchOpportunitiesWithoutGeo(): Promise<number> {
  return prisma.property.count({ where: { OR: [{ lat: null }, { lng: null }] } });
}

export async function fetchOpportunityStats(): Promise<{
  total: number;
  newToday: number;
  highScore: number;
  avgScore: number;
}> {
  const total = await prisma.property.count();
  if (total === 0) return { total: 0, newToday: 0, highScore: 0, avgScore: 0 };

  const oneDayAgo = new Date(Date.now() - 86_400_000);
  const newToday = await prisma.property.count({
    where: { firstSeen: { gte: oneDayAgo } },
  });

  // Solo computamos score sobre propiedades con datos completos.
  const all = await fetchOpportunities();
  const scored = all.filter((p) => p.opportunityScore !== null) as Array<
    Property & { opportunityScore: number }
  >;
  const highScore = scored.filter((p) => p.opportunityScore >= 80).length;
  const avgScore =
    scored.length === 0
      ? 0
      : Math.round(scored.reduce((acc, p) => acc + p.opportunityScore, 0) / scored.length);

  return { total, newToday, highScore, avgScore };
}
