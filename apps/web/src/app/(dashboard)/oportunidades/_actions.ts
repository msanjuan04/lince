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

// ============================================================================
// Análisis visual bajo demanda — Claude Vision sobre la foto principal de una
// propiedad concreta. Persiste el resultado para que la próxima visita del
// detail no re-cobre tokens.
// ============================================================================

import { prisma, visualAnalysesRepo } from '@lince/db';
import { analyzePropertyPhoto } from '@lince/ai';

export interface AnalyzePhotoResult {
  ok: boolean;
  analysisId?: string;
  conditionLabel?: string | null;
  reformCostPerM2?: number | null;
  costEur?: number;
  error?: string;
}

export async function analyzePropertyPhotoAction(propertyId: string): Promise<AnalyzePhotoResult> {
  if (!propertyId) return { ok: false, error: 'Propiedad sin identificar' };

  try {
    if (!process.env['ANTHROPIC_API_KEY']) {
      return { ok: false, error: 'ANTHROPIC_API_KEY no configurada en el entorno.' };
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        mainImageUrl: true,
        postalCode: true,
        m2: true,
        yearBuilt: true,
        source: true,
      },
    });
    if (!property) return { ok: false, error: 'Propiedad no encontrada.' };
    if (!property.mainImageUrl) {
      return { ok: false, error: 'Esta propiedad no tiene foto principal en la fuente.' };
    }

    const result = await analyzePropertyPhoto({
      imageUrl: property.mainImageUrl,
      context: {
        postalCode: property.postalCode ?? undefined,
        m2: property.m2 ?? undefined,
        yearBuilt: property.yearBuilt ?? undefined,
        sourceLabel: property.source,
      },
    });

    const persisted = await visualAnalysesRepo.createVisualAnalysis({
      propertyId,
      imageUrl: property.mainImageUrl,
      modelId: result.model,
      promptVersion: result.promptVersion,
      conditionScore: result.analysis.conditionScore,
      conditionLabel: result.analysis.conditionLabel,
      reformCostPerM2: result.analysis.reformCostPerM2,
      elementsToReform: result.analysis.elementsToReform,
      visualRedFlags: result.analysis.visualRedFlags,
      photoQuality: result.analysis.photoQuality,
      summary: result.analysis.summary,
      rawResponse: result.analysis,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costEur: result.estimatedCostEur,
    });

    revalidatePath('/oportunidades');
    return {
      ok: true,
      analysisId: persisted.id,
      conditionLabel: result.analysis.conditionLabel,
      reformCostPerM2: result.analysis.reformCostPerM2,
      costEur: result.estimatedCostEur,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
