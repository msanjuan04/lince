// Server-only: data fetching de tracking. Las constantes/labels viven en
// `tracking-types.ts` para que los Client Components puedan importarlas.

import { trackingRepo } from '@lince/db';
import { getCurrentAgencyId } from './repositories';
import type { PropertyTrack, PropertyTrackStatus } from './tracking-types';

export type { PropertyTrack, PropertyTrackStatus };
export { TRACK_STATUS_LABEL, TRACK_STATUS_TONE } from './tracking-types';

export async function getPropertyTrack(propertyId: string): Promise<PropertyTrack | null> {
  try {
    const agencyId = await getCurrentAgencyId();
    const row = await trackingRepo.getTrack(agencyId, propertyId);
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
    const agencyId = await getCurrentAgencyId();
    const map = await trackingRepo.getTracksMap(agencyId, propertyIds);
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
    const agencyId = await getCurrentAgencyId();
    return trackingRepo.listTracksForAgency(agencyId);
  } catch {
    return [];
  }
}
