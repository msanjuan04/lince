'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { zonesRepo } from '@lince/db';
import { normalizeE164 } from '@lince/notifier';
import { getCurrentAgencyId } from '@/lib/data/repositories';

const POSTAL_CODE_RE = /^\d{5}$/;

const PROPERTY_TYPES = ['piso', 'casa', 'atico', 'duplex', 'local', 'terreno'] as const;
const ALERT_CHANNELS = ['email', 'whatsapp', 'telegram'] as const;

export const createZoneSchema = z
  .object({
    name: z.string().trim().min(2, 'Nombre demasiado corto').max(80, 'Nombre demasiado largo'),
    postalCodes: z
      .string()
      .trim()
      .min(1, 'Indica al menos un código postal')
      .transform((s) =>
        s
          .split(/[\s,;]+/)
          .map((cp) => cp.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().regex(POSTAL_CODE_RE, 'Código postal inválido')).min(1)),
    minScore: z.coerce.number().min(0).max(100).default(60),
    maxPrice: z
      .union([z.literal(''), z.coerce.number().int().positive()])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .default(null),
    types: z.array(z.enum(PROPERTY_TYPES)).default([]),
    minRooms: z
      .union([z.literal(''), z.coerce.number().int().min(0).max(10)])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .default(null),
    alertChannels: z.array(z.enum(ALERT_CHANNELS)).min(1, 'Elige al menos un canal'),
    alertPhone: z
      .string()
      .trim()
      .transform((s) => (s === '' ? null : s))
      .nullable()
      .default(null),
  })
  .superRefine((data, ctx) => {
    if (data.alertChannels.includes('whatsapp')) {
      if (!data.alertPhone) {
        ctx.addIssue({
          code: 'custom',
          path: ['alertPhone'],
          message: 'Indica tu teléfono para recibir el WhatsApp',
        });
        return;
      }
      if (!normalizeE164(data.alertPhone)) {
        ctx.addIssue({
          code: 'custom',
          path: ['alertPhone'],
          message: 'Número no válido (formato esperado: 666 12 34 56 ó +34 666 123 456)',
        });
      }
    }
  });

export type CreateZoneState =
  | { status: 'idle' }
  | { status: 'success'; zoneId: string }
  | { status: 'error'; fieldErrors: Record<string, string[]>; formError?: string };

export async function createZoneAction(
  _prev: CreateZoneState,
  formData: FormData,
): Promise<CreateZoneState> {
  const raw = {
    name: formData.get('name'),
    postalCodes: formData.get('postalCodes'),
    minScore: formData.get('minScore') || '60',
    maxPrice: formData.get('maxPrice') || '',
    types: formData.getAll('types'),
    minRooms: formData.get('minRooms') || '',
    alertChannels: formData.getAll('alertChannels'),
    alertPhone: formData.get('alertPhone') || '',
  };

  const parsed = createZoneSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { status: 'error', fieldErrors };
  }

  const phone = parsed.data.alertPhone ? normalizeE164(parsed.data.alertPhone) : null;
  const agencyId = await getCurrentAgencyId();

  try {
    const zone = await zonesRepo.createZone({
      agencyId,
      name: parsed.data.name,
      postalCodes: parsed.data.postalCodes,
      filters: {
        minScore: parsed.data.minScore,
        maxPrice: parsed.data.maxPrice,
        types: parsed.data.types,
        minRooms: parsed.data.minRooms,
      },
      alertChannels: parsed.data.alertChannels,
      alertPhoneE164: phone,
    });
    revalidatePath('/zonas');
    return { status: 'success', zoneId: zone.id };
  } catch (err) {
    console.error('[createZoneAction] DB error:', err);
    return {
      status: 'error',
      fieldErrors: {},
      formError: 'No se pudo crear la zona. Comprueba la conexión a DB.',
    };
  }
}

export async function deleteZoneAction(zoneId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await zonesRepo.deleteZone(zoneId);
    revalidatePath('/zonas');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function toggleZoneActiveAction(
  zoneId: string,
  active: boolean,
): Promise<{ ok: boolean }> {
  try {
    await zonesRepo.updateZone(zoneId, { active });
    revalidatePath('/zonas');
    return { ok: true };
  } catch (err) {
    console.error('[toggleZoneActiveAction] error:', err);
    return { ok: false };
  }
}
