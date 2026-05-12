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
  email: string;
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

export interface Property {
  id: string;
  source: PropertySource;
  sourceId: string;
  sourceUrl: string | null;
  type: PropertyType;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  lat: number;
  lng: number;
  cadastralRef: string | null;
  m2: number;
  rooms: number;
  bathrooms: number;
  yearBuilt: number | null;
  price: number;
  pricePerM2: number;
  zoneAvgPricePerM2: number;
  opportunityScore: number;
  status: 'active' | 'sold' | 'withdrawn';
  description: string;
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
