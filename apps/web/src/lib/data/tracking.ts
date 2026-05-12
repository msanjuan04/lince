// Tipos y helpers de tracking para la UI de la app.

import { trackingRepo } from '@lince/db';
import { DEMO_AGENCY_ID } from './mocks/agency';

export type PropertyTrackStatus =
  | 'watching'
  | 'interested'
  | 'contacted'
  | 'viewed'
  | 'offering'
  | 'rejected'
  | 'bought';

export interface PropertyTrack {
  status: PropertyTrackStatus;
  notes: string | null;
  targetPriceEur: number | null;
  contactedAt: Date | null;
  viewedAt: Date | null;
  updatedAt: Date;
}

export const TRACK_STATUS_LABEL: Record<PropertyTrackStatus, string> = {
  watching: 'Vigilando',
  interested: 'Interesado',
  contacted: 'Contactado',
  viewed: 'Visitado',
  offering: 'Negociando',
  rejected: 'Descartado',
  bought: 'Adquirido',
};

export const TRACK_STATUS_TONE: Record<PropertyTrackStatus, 'default' | 'highlight' | 'mute'> = {
  watching: 'default',
  interested: 'highlight',
  contacted: 'highlight',
  viewed: 'highlight',
  offering: 'highlight',
  rejected: 'mute',
  bought: 'highlight',
};

export async function getPropertyTrack(propertyId: string): Promise<PropertyTrack | null> {
  try {
    const row = await trackingRepo.getTrack(DEMO_AGENCY_ID, propertyId);
    if (!row) return null;
    return {
      status: row.status as PropertyTrackStatus,
      notes: row.notes,
      targetPriceEur: row.targetPriceEur ? Number(row.targetPriceEur) : null,
      contactedAt: row.contactedAt,
      viewedAt: row.viewedAt,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getTracksMap(propertyIds: string[]): Promise<Map<string, PropertyTrack>> {
  try {
    const map = await trackingRepo.getTracksMap(DEMO_AGENCY_ID, propertyIds);
    const out = new Map<string, PropertyTrack>();
    for (const [k, row] of map) {
      out.set(k, {
        status: row.status as PropertyTrackStatus,
        notes: row.notes,
        targetPriceEur: row.targetPriceEur ? Number(row.targetPriceEur) : null,
        contactedAt: row.contactedAt,
        viewedAt: row.viewedAt,
        updatedAt: row.updatedAt,
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function listMyTracks() {
  try {
    return trackingRepo.listTracksForAgency(DEMO_AGENCY_ID);
  } catch {
    return [];
  }
}
