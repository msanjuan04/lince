// Adaptador entre el cliente Prisma (@lince/db) y los tipos de UI.
// Calcula zoneAvgPricePerM2 (mediana por CP en una sola query) y opportunityScore
// heurístico hasta que el agente Pulse (Fase 4) lo reemplace por uno real.
//
// La UI espera campos non-null en Property; aplicamos fallbacks razonables para
// los huecos del scraping (address, m², lat/lng, etc.).

import { prisma, Prisma, type Property as PrismaProperty } from '@lince/db';
import type { Property, PropertySource, PropertyType } from './types';

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
  garaje: 'local', // mapeo aproximado; los garajes no tienen tipo propio en UI
  trastero: 'local',
};

// Centroides aproximados por CP (BCN ciudad + Maresme + Costa Brava).
// Se usan como fallback cuando lat/lng no están en la fuente.
// Coordenadas redondeadas a 4 decimales (~10m de precisión).
const CP_CENTROIDS: Record<string, [number, number]> = {
  '08001': [41.3804, 2.1707],
  '08002': [41.3819, 2.1764],
  '08003': [41.3851, 2.1825],
  '08004': [41.3756, 2.1638],
  '08005': [41.3998, 2.2024],
  '08008': [41.3946, 2.158],
  '08010': [41.3925, 2.1764],
  '08011': [41.3796, 2.1576],
  '08015': [41.3791, 2.1567],
  '08018': [41.4012, 2.1995],
  '08019': [41.4083, 2.2069],
  '08025': [41.4118, 2.1666],
  '08026': [41.4116, 2.1798],
  '08028': [41.3811, 2.1187],
  '08030': [41.4346, 2.1855],
  '08036': [41.3873, 2.1474],
  '08038': [41.3645, 2.1346],
  '08172': [41.4729, 2.0843], // Sant Cugat
  '08181': [41.6079, 2.1404], // Sentmenat
  '08211': [41.6178, 2.0863], // Castellar del Vallès
  '08301': [41.5365, 2.4452], // Mataró
  '08530': [41.7256, 2.2832], // La Garriga
  '08700': [41.5781, 1.6175], // Igualada
  '08901': [41.359, 2.0995], // L'Hospitalet
  '08911': [41.4501, 2.2474], // Badalona
};

function fallbackCoord(postalCode: string | null): [number, number] {
  if (postalCode && CP_CENTROIDS[postalCode]) return CP_CENTROIDS[postalCode];
  return [41.3851, 2.1734]; // Plaça Catalunya por defecto
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function mapType(raw: string | null): PropertyType {
  if (!raw) return 'piso';
  const key = raw.toLowerCase().trim();
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  if (VALID_TYPES.includes(key as PropertyType)) return key as PropertyType;
  return 'piso';
}

function mapSource(raw: string): PropertySource {
  return VALID_SOURCES.includes(raw as PropertySource) ? (raw as PropertySource) : 'idealista';
}

/**
 * Calcula mediana de €/m² por CP usando la DB.
 * Devuelve un mapa { '08003': 5400, ... } con la media (no mediana real para
 * simplicidad; PostgreSQL `PERCENTILE_CONT` daría mediana pero el cap de
 * datos actual es bajo). Mejorable cuando haya más volumen.
 */
async function getZoneAvgByCp(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ postal_code: string; avg_eur_m2: number }>>(`
    SELECT postal_code,
           AVG(price_per_m2)::float AS avg_eur_m2
    FROM properties
    WHERE postal_code IS NOT NULL
      AND price_per_m2 IS NOT NULL
      AND is_auction = false  -- excluir subastas del cálculo (precios bajos sesgan)
    GROUP BY postal_code
  `);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.avg_eur_m2 > 500 && r.avg_eur_m2 < 20_000) {
      map.set(r.postal_code, Math.round(r.avg_eur_m2));
    }
  }
  return map;
}

/** Heurística de score: cuanto más por debajo de la mediana, mayor el score. */
function computeScore(pricePerM2: number, zoneAvg: number, isAuction: boolean): number {
  if (zoneAvg <= 0) return 0;
  const delta = (zoneAvg - pricePerM2) / zoneAvg;
  let score = clampScore(delta * 200);
  // Bonus por subasta (Bucket B inherente)
  if (isAuction) score = clampScore(score + 15);
  return score;
}

/** Adaptador Prisma Property → UI Property con todos los fallbacks aplicados. */
function adapt(row: PrismaProperty, zoneAvgByCp: Map<string, number>): Property {
  const postalCode = row.postalCode ?? '00000';
  const pricePerM2 = row.pricePerM2 ? Number(row.pricePerM2) : 0;
  const price = row.price ? Number(row.price) : 0;
  const zoneAvg = zoneAvgByCp.get(postalCode) ?? pricePerM2;
  const isAuction = row.isAuction === true;
  const score = pricePerM2 > 0 ? computeScore(pricePerM2, zoneAvg, isAuction) : 0;
  const [lat, lng] = row.lat && row.lng ? [row.lat, row.lng] : fallbackCoord(postalCode);

  return {
    id: row.id,
    source: mapSource(row.source),
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    type: mapType(row.type),
    address: row.address ?? 'Sin dirección',
    city: row.city ?? deriveCityFromCp(postalCode),
    postalCode,
    province: row.province ?? 'Barcelona',
    lat,
    lng,
    cadastralRef: row.cadastralRef,
    m2: row.m2 ?? 0,
    rooms: row.rooms ?? 0,
    bathrooms: row.bathrooms ?? 0,
    yearBuilt: row.yearBuilt,
    price,
    pricePerM2,
    zoneAvgPricePerM2: zoneAvg,
    opportunityScore: score,
    status: 'active',
    description: row.description ?? '',
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
  };
}

function deriveCityFromCp(cp: string): string {
  // Catálogo mínimo para los CPs que tocamos en sprint 1
  const CITIES: Record<string, string> = {
    '08901': "L'Hospitalet de Llobregat",
    '08911': 'Badalona',
    '08172': 'Sant Cugat del Vallès',
    '08181': 'Sentmenat',
    '08211': 'Castellar del Vallès',
    '08301': 'Mataró',
    '08530': 'La Garriga',
    '08700': 'Igualada',
  };
  if (CITIES[cp]) return CITIES[cp];
  if (cp.startsWith('08')) return 'Barcelona';
  if (cp.startsWith('17')) return 'Girona';
  if (cp.startsWith('25')) return 'Lleida';
  if (cp.startsWith('43')) return 'Tarragona';
  return '—';
}

// ----- Public queries -----

export interface DbOpportunityFilters {
  postalCodes?: string[];
  minScore?: number;
  maxPrice?: number;
  minRooms?: number;
  types?: PropertyType[];
  search?: string;
}

export async function fetchOpportunities(filters: DbOpportunityFilters = {}): Promise<Property[]> {
  const zoneAvgByCp = await getZoneAvgByCp();

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

  const rows = await prisma.property.findMany({
    where,
    orderBy: [{ lastSeen: 'desc' }],
    take: 500,
  });

  let adapted = rows.map((r) => adapt(r, zoneAvgByCp));

  if (filters.types && filters.types.length > 0) {
    const setT = new Set(filters.types);
    adapted = adapted.filter((p) => setT.has(p.type));
  }
  if (filters.minScore !== undefined) {
    const min = filters.minScore;
    adapted = adapted.filter((p) => p.opportunityScore >= min);
  }

  return adapted.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  const zoneAvgByCp = await getZoneAvgByCp();
  const row = await prisma.property.findUnique({ where: { id } });
  return row ? adapt(row, zoneAvgByCp) : null;
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

/** Distribución por bucket de oportunidad (para el dashboard home). */
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

  // High-score: score >= 60 (heurística)
  const all = await fetchOpportunities();
  const highScore = all.filter((p) => p.opportunityScore >= 60).length;

  return { auctions, bankOwned, needsReform, withTerrace, withRedFlags, highScore };
}

/** Propiedades con coordenadas (real o fallback CP) para el mapa. */
export async function fetchOpportunitiesForMap(): Promise<Property[]> {
  return fetchOpportunities();
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

  // Computar score sobre todas las propiedades (cap razonable)
  const zoneAvgByCp = await getZoneAvgByCp();
  const rows = await prisma.property.findMany({ take: 2000 });
  const scores = rows.map((r) => {
    const cp = r.postalCode ?? '00000';
    const ppm = r.pricePerM2 ? Number(r.pricePerM2) : 0;
    const zoneAvg = zoneAvgByCp.get(cp) ?? ppm;
    return ppm > 0 ? computeScore(ppm, zoneAvg, r.isAuction === true) : 0;
  });
  const highScore = scores.filter((s) => s >= 80).length;
  const avgScore =
    scores.length === 0 ? 0 : Math.round(scores.reduce((acc, s) => acc + s, 0) / scores.length);

  return { total, newToday, highScore, avgScore };
}
