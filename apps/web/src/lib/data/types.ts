// Tipos del dominio. Alineados con el schema Prisma de packages/db pero usando
// tipos JS nativos (Date en vez de DateTime, number en vez de Decimal).
// Cuando swapeemos a queries reales, los tipos de Prisma sustituyen a estos
// — los componentes de UI no necesitan cambiar.

export type AgencyPlan = 'basic' | 'pro' | 'elite' | 'founder';

export type AgencyMemberRole = 'owner' | 'agent' | 'admin';

export type CaptureStatus = 'new' | 'contacted' | 'meeting' | 'signed' | 'lost';

export type ListingStatus = 'draft' | 'live' | 'sold' | 'withdrawn';

export type ListingLeadStatus = 'new' | 'contacted' | 'qualified' | 'lost' | 'closed';

export type PropertyType = 'piso' | 'casa' | 'atico' | 'duplex' | 'local' | 'terreno';

export type PropertySource =
  | 'idealista'
  | 'fotocasa'
  | 'habitaclia'
  | 'pisos'
  | 'boe'
  | 'sareb'
  | 'aliseda'
  | 'solvia'
  | 'haya'
  | 'casaktua'
  | 'anida';

export type AlertChannel = 'email' | 'whatsapp' | 'telegram';

export interface Agency {
  id: string;
  name: string;
  plan: AgencyPlan;
  active: boolean;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string | null;
  phoneE164: string | null;
  name: string | null;
  createdAt: Date;
}

export interface AgencyMember {
  agencyId: string;
  userId: string;
  role: AgencyMemberRole;
  user: User;
}

export interface PriceHistoryEntry {
  observedAt: Date;
  oldPrice: number | null;
  newPrice: number;
  deltaPct: number | null;
}

export type TagTone = 'positive' | 'negative' | 'neutral' | 'info';

export interface FactTag {
  id: string;
  label: string;
  tone: TagTone;
  /** Origen literal del dato — visible en tooltip para auditoría. */
  source: string;
}

/** Tier de zona según el informe de mercado. D = momentum negativo. */
export type ZoneTier = 'A' | 'B' | 'C' | 'D';
export type ZoneMomentum = 'high' | 'medium' | 'low' | 'negative';

/** Información de referencia de mercado para el CP de la propiedad. */
export interface MarketReference {
  municipality: string;
  district: string | null;
  avgEurM2: number;
  premiumEurM2: number | null;
  yoyPct: number;
  tier: ZoneTier;
  momentum: ZoneMomentum;
  source: string;
  notes?: string;
}

/** Análisis visual de la foto principal por Claude Vision. */
export interface VisualAnalysisView {
  id: string;
  imageUrl: string;
  conditionScore: number | null;
  conditionLabel: string | null;
  reformCostPerM2: number | null;
  elementsToReform: string[];
  visualRedFlags: string[];
  photoQuality: string | null;
  summary: string | null;
  modelId: string;
  costEur: number;
  createdAt: Date;
}

/** Mediana de absorción medida por el crawler — proxy de tiempo en mercado. */
export interface AbsorptionView {
  /** Mediana de días entre publicación y desaparición del crawler. */
  medianDays: number;
  /** Tamaño muestra. Min 3 para que aparezca. */
  sampleSize: number;
  /** Bucket usado: subasta / bank-owned / portal. */
  bucket: 'auction' | 'bank_owned' | 'portal';
}

/** Estimación flip completa para una propiedad. */
export interface FlipEstimateView {
  acquisitionCostTotal: number | null;
  reformCost: number | null;
  totalInvestment: number | null;
  expectedSalePrice: number | null;
  expectedSaleEurM2: number | null;
  expectedSaleSource: string | null;
  netSaleProceeds: number | null;
  grossMarginEur: number | null;
  grossMarginPct: number | null;
  cycleMonths: number | null;
  annualizedMarginPct: number | null;
  reasons: string[];
  breakdown: string[];
  /** Parámetros usados (€/m² reforma aplicado, etc.) para auditoría. */
  params: {
    eurM2Reform: number;
    monthsToSell: number | null;
  };
}

/**
 * Histórico observado por Lince. Nombre explícito: NO es histórico real del
 * portal — solo refleja lo que Lince ha visto desde first_seen.
 */
export interface ObservedHistory {
  /** Días desde que Lince vio la propiedad por primera vez. ≠ días en mercado real. */
  daysObservedByLince: number;
  /** Rebajas detectadas entre crawls. */
  dropCount: number;
  /** Magnitud acumulada (negativo). */
  dropTotalPct: number;
  /** Días desde la última rebaja. Null si nunca ha bajado. */
  daysSinceLastDrop: number | null;
}

/**
 * Modelo Property tal y como lo consume la UI.
 *
 * Honestidad: TODO campo que no podamos garantizar como real viene como `null`
 * (incluyendo lat/lng — NO usamos fallback de centroide CP) o `undefined`. La
 * UI debe renderizar `—` para nulls y nunca inventar coordenadas / m² / etc.
 */
export interface Property {
  id: string;
  source: PropertySource;
  sourceLabel: string; // texto humano: "Pisos.com", "BOE Subastas", o el raw si es desconocido
  sourceId: string;
  sourceUrl: string | null;
  type: PropertyType | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  cadastralRef: string | null;
  m2: number | null;
  rooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  price: number | null;
  pricePerM2: number | null;
  /** Media €/m² de la zona — null si la muestra del CP es insuficiente (<3). */
  zoneAvgPricePerM2: number | null;
  /** Nº de propiedades usadas para calcular la media de zona. */
  zoneSampleSize: number;
  /** Delta % vs zona — null si zoneAvgPricePerM2 es null. */
  zoneDeltaPct: number | null;
  /**
   * Score 0..100. Derivado SOLO del descuento vs mediana del bucket del CP.
   * Null si no hay muestra suficiente. No mezcla heurísticas.
   */
  opportunityScore: number | null;
  /**
   * Descuento numérico real vs mediana del bucket. Ej. -0.51 = 51% bajo
   * mediana. Es la métrica honesta que da origen al score.
   */
  discountVsBucketPct: number | null;
  /** Mediana €/m² del bucket al que pertenece (subasta/bank/portal). Null si poca muestra. */
  bucketMedianEurM2: number | null;
  /** Nº muestras del bucket usado para la mediana. */
  bucketSampleSize: number;
  /**
   * Frase humana con el cálculo literal del score, o por qué no se pudo
   * calcular. Para mostrar al inversor con auditoría.
   */
  scoreReason: string;
  /** Caveats que el inversor debe conocer (regex falsos positivos, etc). */
  scoreCaveats: string[];
  /** Etiquetas factuales — no suman al score, son contexto verificable. */
  tags: FactTag[];
  /**
   * Histórico observado por Lince. Null si la propiedad acaba de entrar y no
   * tiene aún ni una entrada de historia (caso raro — siempre creamos 1 al
   * upsertar).
   */
  observedHistory: ObservedHistory;
  /**
   * Referencia de mercado para el CP de la propiedad — del informe Idealista/
   * Indomio/Fotocasa abril 2026. Null si el CP no está cubierto por el informe
   * (lo cual no debería pasar al filtrar por universo, pero por defensa).
   */
  marketReference: MarketReference | null;
  /**
   * Estimación flip — depende de parámetros variables del usuario (€/m²
   * reforma típicamente). En el adapter se calcula con defaults; la UI puede
   * recalcular en cliente con sliders.
   */
  flipEstimate: FlipEstimateView | null;
  /**
   * Absorción medida por el crawler para el CP+bucket de esta propiedad.
   * Null si todavía no hay muestra suficiente (mínimo 3). Cuando aparece,
   * el flip estimate puede calcular `monthsToSell` y por tanto el ciclo +
   * margen anualizado.
   */
  absorption: AbsorptionView | null;
  /**
   * Último análisis visual de Claude Vision sobre la foto principal. Solo
   * cargado en `fetchPropertyById` (no en listados — sería N+1). Null si
   * todavía no se ha analizado.
   */
  visualAnalysis: VisualAnalysisView | null;
  status: 'active' | 'auction' | 'sold' | 'withdrawn' | null;
  isAuction: boolean;
  isBankOwned: boolean;
  condition: string | null;
  hasTerrace: boolean | null;
  hasElevator: boolean | null;
  floor: string | null;
  orientation: string | null;
  redFlags: string[];
  description: string | null;
  firstSeen: Date;
  lastSeen: Date;
}

export interface Zone {
  id: string;
  agencyId: string;
  name: string;
  postalCodes: string[];
  filters: ZoneFilters;
  alertChannels: AlertChannel[];
  active: boolean;
  createdAt: Date;
  // Counts derivados (calculados por la repository, no por la UI)
  matchingCount: number;
  newToday: number;
}

export interface ZoneFilters {
  minScore: number;
  maxPrice: number | null;
  types: PropertyType[];
  minRooms: number | null;
}

export interface Capture {
  id: string;
  agencyId: string;
  propertyId: string;
  status: CaptureStatus;
  notes: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  proposalPdfUrl: string | null;
  contactedAt: Date | null;
  signedAt: Date | null;
  dealValue: number | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined
  property: Property;
}

export interface Listing {
  id: string;
  captureId: string | null;
  agencyId: string;
  fichaSeoText: string | null;
  photos: ListingPhoto[];
  stagingPhotos: ListingPhoto[];
  price: number;
  status: ListingStatus;
  distributedTo: string[];
  viewsCount: number;
  leadsCount: number;
  createdAt: Date;
  // Joined
  property: Property;
}

export interface ListingPhoto {
  url: string;
  alt: string;
  order: number;
}

export interface ListingLead {
  id: string;
  listingId: string;
  agencyId: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  message: string | null;
  status: ListingLeadStatus;
  createdAt: Date;
}
