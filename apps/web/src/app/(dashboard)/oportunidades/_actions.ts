'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { trackingRepo, type PropertyTrackStatus } from '@lince/db';
import { getCurrentAgencyId } from '@/lib/data/repositories';

export interface CapturePropertyResult {
  ok: boolean;
  captureId?: string;
  error?: string;
}

/**
 * Marca una propiedad como tracked (status 'watching' por defecto).
 * El inversor puede después cambiar status, añadir notas y fijar target price.
 */
export async function captureProperty(propertyId: string): Promise<CapturePropertyResult> {
  if (!propertyId) return { ok: false, error: 'Propiedad sin identificar' };
  try {
    const agencyId = await getCurrentAgencyId();
    await trackingRepo.upsertTrack({
      agencyId,
      propertyId,
      status: 'watching',
    });
    revalidatePath('/oportunidades');
    revalidatePath('/seguimiento');
    return { ok: true, captureId: propertyId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

const TRACK_STATUSES = [
  'watching',
  'interested',
  'contacted',
  'viewed',
  'offering',
  'rejected',
  'bought',
] as const;

const updateTrackSchema = z.object({
  propertyId: z.string().uuid(),
  status: z.enum(TRACK_STATUSES).optional(),
  notes: z
    .string()
    .max(5000)
    .transform((s) => (s.trim() === '' ? null : s))
    .nullable()
    .optional(),
  targetPriceEur: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
});

export interface UpdateTrackResult {
  ok: boolean;
  error?: string;
}

export async function updateTrackAction(
  input: z.input<typeof updateTrackSchema>,
): Promise<UpdateTrackResult> {
  const parsed = updateTrackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }
  try {
    const data = parsed.data;
    // Si pasa a 'contacted' por primera vez, registramos contactedAt.
    // Si pasa a 'viewed', viewedAt.
    const now = new Date();
    const agencyId = await getCurrentAgencyId();
    await trackingRepo.upsertTrack({
      agencyId,
      propertyId: data.propertyId,
      status: data.status as PropertyTrackStatus | undefined,
      notes: data.notes ?? undefined,
      targetPriceEur: data.targetPriceEur ?? undefined,
      contactedAt: data.status === 'contacted' ? now : undefined,
      viewedAt: data.status === 'viewed' ? now : undefined,
    });
    revalidatePath('/oportunidades');
    revalidatePath('/seguimiento');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function removeTrackAction(propertyId: string): Promise<UpdateTrackResult> {
  try {
    const agencyId = await getCurrentAgencyId();
    await trackingRepo.removeTrack(agencyId, propertyId);
    revalidatePath('/oportunidades');
    revalidatePath('/seguimiento');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
