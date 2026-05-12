// Capa pública del data layer. Todas las funciones son async para que el swap
// a Prisma queries (cuando exista la DB) sea trivial: solo cambia el cuerpo.
//
// La UI nunca debe importar nada de `./mocks/` directamente.

import type {
  AgencyMember,
  Capture,
  CaptureStatus,
  Listing,
  ListingLead,
  Property,
  PropertyType,
  Zone,
} from './types';
import { currentAgency, currentUser, agencyMembersMock } from './mocks/agency';
import { propertiesMock } from './mocks/properties';
import { zonesMock } from './mocks/zones';
import { capturesMock } from './mocks/captures';
import { listingsMock, listingLeadsMock } from './mocks/listings';

// ─────────────────────────────────────────────────────────────────────────────
// Sesión actual (mock — sustituir por Auth.js cuando esté listo)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentSession() {
  return { user: currentUser, agency: currentAgency };
}

export async function getAgencyMembers(): Promise<AgencyMember[]> {
  return agencyMembersMock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Propiedades / Oportunidades
// ─────────────────────────────────────────────────────────────────────────────

export interface OpportunityFilters {
  postalCodes?: string[];
  minScore?: number;
  maxPrice?: number;
  minRooms?: number;
  types?: PropertyType[];
  search?: string;
}

export async function getOpportunities(filters: OpportunityFilters = {}): Promise<Property[]> {
  const items = propertiesMock.filter((p) => {
    if (filters.postalCodes?.length && !filters.postalCodes.includes(p.postalCode)) return false;
    if (filters.minScore !== undefined && p.opportunityScore < filters.minScore) return false;
    if (filters.maxPrice !== undefined && p.price > filters.maxPrice) return false;
    if (filters.minRooms !== undefined && p.rooms < filters.minRooms) return false;
    if (filters.types?.length && !filters.types.includes(p.type)) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${p.address} ${p.city} ${p.postalCode} ${p.description}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return items.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

export async function getPropertyById(id: string): Promise<Property | null> {
  return propertiesMock.find((p) => p.id === id) ?? null;
}

export async function getOpportunityStats(): Promise<{
  total: number;
  newToday: number;
  highScore: number;
  avgScore: number;
}> {
  const items = propertiesMock;
  const oneDayAgo = Date.now() - 86_400_000;
  const newToday = items.filter((p) => p.firstSeen.getTime() > oneDayAgo).length;
  const highScore = items.filter((p) => p.opportunityScore >= 80).length;
  const avgScore =
    items.length === 0
      ? 0
      : Math.round(items.reduce((acc, p) => acc + p.opportunityScore, 0) / items.length);
  return { total: items.length, newToday, highScore, avgScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zones
// ─────────────────────────────────────────────────────────────────────────────

export async function getZones(): Promise<Zone[]> {
  return zonesMock;
}

export async function getZoneById(id: string): Promise<Zone | null> {
  return zonesMock.find((z) => z.id === id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Captures
// ─────────────────────────────────────────────────────────────────────────────

export async function getCaptures(): Promise<Capture[]> {
  return capturesMock;
}

export async function getCapturesByStatus(): Promise<Record<CaptureStatus, Capture[]>> {
  const grouped: Record<CaptureStatus, Capture[]> = {
    new: [],
    contacted: [],
    meeting: [],
    signed: [],
    lost: [],
  };
  for (const c of capturesMock) grouped[c.status].push(c);
  return grouped;
}

export async function getCaptureStats(): Promise<{
  total: number;
  active: number;
  signed: number;
  signedValue: number;
}> {
  const total = capturesMock.length;
  const signedItems = capturesMock.filter((c) => c.status === 'signed');
  const signedValue = signedItems.reduce((acc, c) => acc + (c.dealValue ?? 0), 0);
  const active = capturesMock.filter((c) => c.status !== 'signed' && c.status !== 'lost').length;
  return { total, active, signed: signedItems.length, signedValue };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listings
// ─────────────────────────────────────────────────────────────────────────────

export async function getListings(): Promise<Listing[]> {
  return listingsMock;
}

export async function getListingById(id: string): Promise<Listing | null> {
  return listingsMock.find((l) => l.id === id) ?? null;
}

export async function getListingLeads(listingId?: string): Promise<ListingLead[]> {
  if (listingId) return listingLeadsMock.filter((l) => l.listingId === listingId);
  return listingLeadsMock;
}

export async function getListingStats(): Promise<{
  total: number;
  live: number;
  views: number;
  leads: number;
}> {
  const total = listingsMock.length;
  const live = listingsMock.filter((l) => l.status === 'live').length;
  const views = listingsMock.reduce((acc, l) => acc + l.viewsCount, 0);
  const leads = listingsMock.reduce((acc, l) => acc + l.leadsCount, 0);
  return { total, live, views, leads };
}
