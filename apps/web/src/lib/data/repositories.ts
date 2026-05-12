// Capa pública del data layer. Conecta directamente a Prisma vía `./db`.
//
// Política de la sesión: la app solo muestra datos reales de Supabase. Si la
// DB falla o está vacía, devolvemos vacíos honestos en lugar de mocks.

import type {
  AgencyMember,
  Capture,
  CaptureStatus,
  Listing,
  ListingLead,
  PriceHistoryEntry,
  Property,
  PropertyType,
  Zone,
} from './types';
import { currentAgency, currentUser, agencyMembersMock } from './mocks/agency';
import { zonesMock } from './mocks/zones';
import { capturesMock } from './mocks/captures';
import { listingsMock, listingLeadsMock } from './mocks/listings';
import {
  fetchBucketDistribution,
  fetchOpportunities,
  fetchOpportunitiesForMap,
  fetchOpportunitiesWithoutGeo,
  fetchOpportunityStats,
  fetchPropertyById,
  fetchPropertyHistory,
  fetchSourceDistribution,
  fetchTopOpportunities,
  type DbOpportunityFilters,
} from './db';

// ─────────────────────────────────────────────────────────────────────────────
// Sesión (placeholder hasta Auth.js v5 — Fase 5+)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentSession() {
  return { user: currentUser, agency: currentAgency };
}

export async function getAgencyMembers(): Promise<AgencyMember[]> {
  return agencyMembersMock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Propiedades / Oportunidades — TODO REAL
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
  try {
    return await fetchOpportunities(filters as DbOpportunityFilters);
  } catch (err) {
    console.warn('[repositories] getOpportunities falló:', err);
    return [];
  }
}

export async function getPropertyById(id: string): Promise<Property | null> {
  try {
    return await fetchPropertyById(id);
  } catch (err) {
    console.warn('[repositories] getPropertyById falló:', err);
    return null;
  }
}

export async function getPropertyHistory(id: string): Promise<PriceHistoryEntry[]> {
  try {
    return await fetchPropertyHistory(id);
  } catch (err) {
    console.warn('[repositories] getPropertyHistory falló:', err);
    return [];
  }
}

export async function getTopOpportunities(limit = 5): Promise<Property[]> {
  try {
    return await fetchTopOpportunities(limit);
  } catch {
    return [];
  }
}

export async function getOpportunitiesForMap(): Promise<{
  properties: Property[];
  withoutGeo: number;
}> {
  try {
    const [properties, withoutGeo] = await Promise.all([
      fetchOpportunitiesForMap(),
      fetchOpportunitiesWithoutGeo(),
    ]);
    return { properties, withoutGeo };
  } catch {
    return { properties: [], withoutGeo: 0 };
  }
}

export async function getSourceDistribution(): Promise<Array<{ source: string; count: number }>> {
  try {
    return await fetchSourceDistribution();
  } catch {
    return [];
  }
}

export async function getBucketDistribution(): Promise<{
  auctions: number;
  bankOwned: number;
  needsReform: number;
  withTerrace: number;
  withRedFlags: number;
  highScore: number;
}> {
  try {
    return await fetchBucketDistribution();
  } catch {
    return {
      auctions: 0,
      bankOwned: 0,
      needsReform: 0,
      withTerrace: 0,
      withRedFlags: 0,
      highScore: 0,
    };
  }
}

export async function getOpportunityStats(): Promise<{
  total: number;
  newToday: number;
  highScore: number;
  avgScore: number;
}> {
  try {
    return await fetchOpportunityStats();
  } catch {
    return { total: 0, newToday: 0, highScore: 0, avgScore: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zones / Captures / Listings — vacío hasta Fase 3-5
// ─────────────────────────────────────────────────────────────────────────────

export async function getZones(): Promise<Zone[]> {
  return zonesMock;
}

export async function getZoneById(id: string): Promise<Zone | null> {
  return zonesMock.find((z) => z.id === id) ?? null;
}

export async function getCaptures(): Promise<Capture[]> {
  return capturesMock;
}

export async function getCapturesByStatus(): Promise<Record<CaptureStatus, Capture[]>> {
  return { new: [], contacted: [], meeting: [], signed: [], lost: [] };
}

export async function getCaptureStats(): Promise<{
  total: number;
  active: number;
  signed: number;
  signedValue: number;
}> {
  return { total: 0, active: 0, signed: 0, signedValue: 0 };
}

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
  return { total: 0, live: 0, views: 0, leads: 0 };
}
