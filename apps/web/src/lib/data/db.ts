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

import {
  prisma,
  Prisma,
  type Property as PrismaProperty,
  zoneStatsRepo,
  priceHistorySummaryRepo,
  absorptionRepo,
  visualAnalysesRepo,
  bucketOf,
  absorptionKey,
  type ZoneStats,
  type PriceHistorySummary,
  type AbsorptionStat,
  getReferenceByPostalCode,
  estimateSalePricePerM2FromReference,
  type MarketReferenceEntry,
} from '@lince/db';
import { computeOpportunityFacts, computeFlipEstimate, FLIP_DEFAULTS } from '@lince/ai';
import type {
  AbsorptionView,
  FlipEstimateView,
  MarketReference,
  ObservedHistory,
  PriceHistoryEntry,
  Property,
  PropertySource,
  PropertyType,
  VisualAnalysisView,
} from './types';

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
 * Snapshot agregado de toda la DB que se calcula UNA vez por fetch y se reusa
 * para todas las propiedades. Cada parte es una query agregada barata sobre
 * datos REALES — sin pesos ni heurísticas inventadas.
 */
interface DataSnapshot {
  zoneStats: Map<string, ZoneStats>;
  priceHistorySummaries: Map<string, PriceHistorySummary>;
  absorption: Map<string, AbsorptionStat>;
}

async function loadSnapshot(): Promise<DataSnapshot> {
  const [zoneStats, priceHistorySummaries, absorption] = await Promise.all([
    zoneStatsRepo.getZoneStatsMap(),
    priceHistorySummaryRepo.getPriceHistorySummaryMap(),
    absorptionRepo.getAbsorptionMap(),
  ]);
  return { zoneStats, priceHistorySummaries, absorption };
}

/**
 * Construye el `ObservedHistory` desde la fila + resumen del repo. Nombre
 * deliberado: `daysObservedByLince` ≠ días en mercado real. Si no hay summary,
 * todo a cero/null — la propiedad no tiene rebajas detectadas.
 */
function buildObservedHistory(
  row: PrismaProperty,
  summary: PriceHistorySummary | undefined,
): ObservedHistory {
  const now = Date.now();
  const daysObservedByLince = Math.max(
    0,
    Math.floor((now - row.firstSeen.getTime()) / (1000 * 60 * 60 * 24)),
  );
  if (!summary) {
    return { daysObservedByLince, dropCount: 0, dropTotalPct: 0, daysSinceLastDrop: null };
  }
  return {
    daysObservedByLince,
    dropCount: summary.dropCount,
    dropTotalPct: summary.dropTotalPct,
    daysSinceLastDrop: summary.daysSinceLastDrop,
  };
}

/**
 * Construye la vista de estimación flip para una propiedad. Usa defaults
 * razonables:
 *   - €/m² reforma = 700 (placeholder, override por usuario)
 *   - Precio salida = referencia del informe con 10% safety margin
 *   - monthsToSell = mediana absorción real del CP+bucket si hay muestra ≥3,
 *     null si no — entonces el ciclo y anualizado salen como "no calculable".
 */
function buildFlipEstimateView(opts: {
  price: number | null;
  m2: number | null;
  postalCode: string | null;
  bucket: 'auction' | 'bank_owned' | 'portal';
  bucketMedianEurM2: number | null;
  absorptionMap: Map<string, AbsorptionStat>;
}): FlipEstimateView | null {
  if (opts.price === null || opts.m2 === null) {
    return null;
  }

  // Precio salida: referencia del informe con safety margin (10%).
  const fromRef = estimateSalePricePerM2FromReference(opts.postalCode, {
    safetyMarginPct: FLIP_DEFAULTS.saleSafetyMarginPct,
  });
  const expectedSaleEurM2 = fromRef?.eurM2 ?? null;
  const expectedSaleSource = fromRef
    ? `${fromRef.entry.municipality}${fromRef.entry.district ? ' / ' + fromRef.entry.district : ''} (${fromRef.source}, -10% safety)`
    : null;

  // monthsToSell: mediana absorción real del CP+bucket si ≥3 muestras
  // disponibles. Si no, null y el sistema lo dice claramente.
  let monthsToSell: number | null = null;
  if (opts.postalCode) {
    const key = absorptionKey(opts.postalCode, opts.bucket);
    const stat = opts.absorptionMap.get(key);
    if (stat) {
      // medianDays → meses (división por 30 redondeada).
      monthsToSell = Math.max(1, Math.round(stat.medianDays / 30));
    }
  }

  const result = computeFlipEstimate({
    listPrice: opts.price,
    m2: opts.m2,
    eurM2Reform: FLIP_DEFAULTS.eurM2Reform,
    expectedSaleEurM2,
    expectedSaleSource,
    monthsToSell,
  });

  return {
    acquisitionCostTotal: result.acquisitionCostTotal,
    reformCost: result.reformCost,
    totalInvestment: result.totalInvestment,
    expectedSalePrice: result.expectedSalePrice,
    expectedSaleEurM2,
    expectedSaleSource,
    netSaleProceeds: result.netSaleProceeds,
    grossMarginEur: result.grossMarginEur,
    grossMarginPct: result.grossMarginPct,
    cycleMonths: result.cycleMonths,
    annualizedMarginPct: result.annualizedMarginPct,
    reasons: result.reasons,
    breakdown: result.breakdown,
    params: {
      eurM2Reform: FLIP_DEFAULTS.eurM2Reform,
      monthsToSell,
    },
  };
}

function buildMarketReferenceView(entry: MarketReferenceEntry | null): MarketReference | null {
  if (!entry) return null;
  return {
    municipality: entry.municipality,
    district: entry.district,
    avgEurM2: entry.avgEurM2,
    premiumEurM2: entry.premiumEurM2,
    yoyPct: entry.yoyPct,
    tier: entry.tier,
    momentum: entry.momentum,
    source: entry.source,
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
}

/** Adaptador honesto Prisma → UI. Cero números inventados. */
function adapt(row: PrismaProperty, snap: DataSnapshot): Property {
  const { source, label } = mapSource(row.source);
  const pricePerM2 = row.pricePerM2 ? Number(row.pricePerM2) : null;
  const price = row.price ? Number(row.price) : null;
  const isAuction = row.isAuction === true;
  const isBankOwned = row.isBankOwned === true;
  const postalCode = row.postalCode ?? null;

  // Estadísticas reales del CP
  const zoneStat = postalCode ? snap.zoneStats.get(postalCode) : undefined;
  const zoneAvgPricePerM2 = zoneStat?.medianEurM2 ?? null;
  const zoneSampleSize = zoneStat?.totalCount ?? 0;

  // Mediana del bucket al que pertenece esta propiedad — base del score.
  const bucket = bucketOf({ isAuction, isBankOwned });
  const bucketStat = zoneStat?.buckets[bucket];
  const bucketMedianEurM2 = bucketStat?.medianEurM2 ?? null;
  const bucketSampleSize = bucketStat?.count ?? 0;

  // Histórico observado (días + rebajas vistas por Lince)
  const observedHistory = buildObservedHistory(row, snap.priceHistorySummaries.get(row.id));

  // Delta vs mediana global del CP — métrica independiente, contexto extra.
  const zoneDeltaPct =
    pricePerM2 !== null && zoneAvgPricePerM2 !== null && zoneAvgPricePerM2 > 0
      ? (zoneAvgPricePerM2 - pricePerM2) / zoneAvgPricePerM2
      : null;

  // Referencia de mercado del CP (informe Idealista/Indomio/Fotocasa abril 2026)
  const refEntry = postalCode ? getReferenceByPostalCode(postalCode) : null;
  const marketReference = buildMarketReferenceView(refEntry);

  // Estimación flip — usa mediana del crawler si la hay, si no la referencia
  // del informe. NUNCA inventa. Si falta dato crítico, devuelve null y razón.
  const flipEstimate = buildFlipEstimateView({
    price,
    m2: row.m2,
    postalCode,
    bucket,
    bucketMedianEurM2,
    absorptionMap: snap.absorption,
  });

  // Absorción medida — para mostrar en UI con sample size.
  const absorptionEntry = postalCode
    ? snap.absorption.get(absorptionKey(postalCode, bucket))
    : undefined;
  const absorption: AbsorptionView | null = absorptionEntry
    ? {
        medianDays: absorptionEntry.medianDays,
        sampleSize: absorptionEntry.sampleSize,
        bucket: absorptionEntry.bucket,
      }
    : null;

  // Score honesto: una sola cifra derivada del descuento vs mediana del bucket.
  const factsResult = computeOpportunityFacts({
    pricePerM2,
    bucketMedianEurM2,
    bucketSampleSize,
    isAuction,
    isBankOwned,
    condition: row.condition,
    redFlags: row.redFlags ?? [],
    m2: row.m2,
    rooms: row.rooms,
    hasTerrace: row.hasTerrace,
    hasElevator: row.hasElevator,
    floor: row.floor,
    yearBuilt: row.yearBuilt,
    hiddenPrice: (row.redFlags ?? []).includes('hidden_price'),
    dropCount: observedHistory.dropCount,
    dropTotalPct: observedHistory.dropTotalPct,
    daysObservedByLince: observedHistory.daysObservedByLince,
    daysSinceLastDrop: observedHistory.daysSinceLastDrop,
  });

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
    lat: row.lat,
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
    opportunityScore: factsResult.discountScore,
    discountVsBucketPct: factsResult.discountVsBucketPct,
    bucketMedianEurM2,
    bucketSampleSize,
    scoreReason: factsResult.reason,
    scoreCaveats: factsResult.caveats,
    tags: factsResult.tags,
    observedHistory,
    marketReference,
    flipEstimate,
    absorption,
    visualAnalysis: null, // se carga solo en fetchPropertyById, no en listados
    status: mapStatus(row.status),
    isAuction,
    isBankOwned,
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
  /** Capital máximo total disponible (compra + reforma). Filtra por totalInvestment del flipEstimate. */
  maxTotalInvestment?: number;
  /** Precio anuncio máximo (antes de ITP / reforma). */
  maxPrice?: number;
  /** Margen bruto € mínimo del flip. */
  minGrossMarginEur?: number;
  /** Margen anualizado mínimo del flip (%). Solo aplica si ciclo es calculable. */
  minAnnualizedMarginPct?: number;
  minRooms?: number;
  minM2?: number;
  maxM2?: number;
  types?: PropertyType[];
  search?: string;
  origin?: 'auction' | 'bank_owned' | 'private' | null;
  excludeRedFlags?: boolean;
  /** Filtra por tier de zona del informe (A/B/C/D). */
  tiers?: Array<'A' | 'B' | 'C' | 'D'>;
  /** Si true, oculta zonas con momentum negativo. */
  excludeNegativeMomentum?: boolean;
  onlyIds?: string[];
  sort?:
    | 'score'
    | 'delta'
    | 'price_asc'
    | 'price_desc'
    | 'eurm2_asc'
    | 'new'
    | 'flip_margin_eur'
    | 'flip_margin_pct';
}

export async function fetchOpportunities(filters: DbOpportunityFilters = {}): Promise<Property[]> {
  const snapshot = await loadSnapshot();

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

  let adapted = rows.map((r) => adapt(r, snapshot));

  if (filters.types && filters.types.length > 0) {
    const setT = new Set(filters.types);
    adapted = adapted.filter((p) => p.type !== null && setT.has(p.type));
  }
  if (filters.minScore !== undefined) {
    const min = filters.minScore;
    adapted = adapted.filter((p) => p.opportunityScore !== null && p.opportunityScore >= min);
  }
  if (filters.minM2 !== undefined) {
    const min = filters.minM2;
    adapted = adapted.filter((p) => p.m2 !== null && p.m2 >= min);
  }
  if (filters.maxM2 !== undefined) {
    const max = filters.maxM2;
    adapted = adapted.filter((p) => p.m2 !== null && p.m2 <= max);
  }
  if (filters.maxTotalInvestment !== undefined) {
    const max = filters.maxTotalInvestment;
    adapted = adapted.filter(
      (p) =>
        p.flipEstimate?.totalInvestment !== null &&
        (p.flipEstimate?.totalInvestment ?? Infinity) <= max,
    );
  }
  if (filters.minGrossMarginEur !== undefined) {
    const min = filters.minGrossMarginEur;
    adapted = adapted.filter(
      (p) =>
        p.flipEstimate?.grossMarginEur !== null &&
        (p.flipEstimate?.grossMarginEur ?? -Infinity) >= min,
    );
  }
  if (filters.minAnnualizedMarginPct !== undefined) {
    const min = filters.minAnnualizedMarginPct;
    adapted = adapted.filter(
      (p) =>
        p.flipEstimate?.annualizedMarginPct !== null &&
        p.flipEstimate?.annualizedMarginPct !== undefined &&
        p.flipEstimate.annualizedMarginPct >= min,
    );
  }
  if (filters.tiers && filters.tiers.length > 0) {
    const setTier = new Set(filters.tiers);
    adapted = adapted.filter(
      (p) => p.marketReference !== null && setTier.has(p.marketReference.tier),
    );
  }
  if (filters.excludeNegativeMomentum) {
    adapted = adapted.filter((p) => p.marketReference?.momentum !== 'negative');
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
      case 'flip_margin_eur': {
        const am = a.flipEstimate?.grossMarginEur ?? -Infinity;
        const bm = b.flipEstimate?.grossMarginEur ?? -Infinity;
        return bm - am;
      }
      case 'flip_margin_pct': {
        const am = a.flipEstimate?.grossMarginPct ?? -Infinity;
        const bm = b.flipEstimate?.grossMarginPct ?? -Infinity;
        return bm - am;
      }
      case 'score':
      default: {
        // El score se satura a 100 para descuentos >50%. Si dos propiedades
        // están saturadas, desempatamos por el descuento real (cifra honesta
        // sin techo) para que el ranking refleje el dato verificable.
        const aScore = a.opportunityScore ?? -1;
        const bScore = b.opportunityScore ?? -1;
        if (aScore === bScore) {
          const aDisc = a.discountVsBucketPct ?? -Infinity;
          const bDisc = b.discountVsBucketPct ?? -Infinity;
          return bDisc - aDisc;
        }
        return bScore - aScore;
      }
    }
  });
  return adapted;
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  const [snapshot, row, visual] = await Promise.all([
    loadSnapshot(),
    prisma.property.findUnique({ where: { id } }),
    visualAnalysesRepo.getLatestVisualAnalysis(id),
  ]);
  if (!row) return null;
  const adapted = adapt(row, snapshot);
  if (visual) {
    const visualView: VisualAnalysisView = {
      id: visual.id,
      imageUrl: visual.imageUrl,
      conditionScore: visual.conditionScore,
      conditionLabel: visual.conditionLabel,
      reformCostPerM2: visual.reformCostPerM2 ? Number(visual.reformCostPerM2) : null,
      elementsToReform: visual.elementsToReform,
      visualRedFlags: visual.visualRedFlags,
      photoQuality: visual.photoQuality,
      summary: visual.summary,
      modelId: visual.modelId,
      costEur: Number(visual.costEur),
      createdAt: visual.createdAt,
    };
    return { ...adapted, visualAnalysis: visualView };
  }
  return adapted;
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
