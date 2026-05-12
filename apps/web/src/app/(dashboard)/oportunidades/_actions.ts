'use server';

import { revalidatePath } from 'next/cache';

export interface CapturePropertyResult {
  ok: boolean;
  captureId?: string;
  error?: string;
}

/**
 * Crea una nueva captura a partir de una propiedad detectada.
 * En sprint 1 simula el insert; cuando exista Supabase, sustituir por
 * `prisma.capture.create({ data: { propertyId, agencyId, status: 'new' } })`.
 */
export async function captureProperty(propertyId: string): Promise<CapturePropertyResult> {
  if (!propertyId) {
    return { ok: false, error: 'Propiedad sin identificar' };
  }
  // TODO(marc): persistir en DB cuando exista Supabase.
  console.warn('[captureProperty] mock insert para', propertyId);
  revalidatePath('/captures');
  revalidatePath('/oportunidades');
  return { ok: true, captureId: `cap-mock-${Date.now()}` };
}
