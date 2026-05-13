'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { registerWithPhone } from '@lince/auth/server';
import { PULSE_ROLES } from '@lince/auth';

const RegisterSchema = z.object({
  phone: z.string().min(9, 'Móvil no válido'),
  pin: z.string().regex(/^\d{6}$/, 'El código debe ser exactamente 6 dígitos'),
  pulseRole: z.enum(PULSE_ROLES, { message: 'Selecciona un rol' }),
});

export type RegisterFormState = {
  error?: string;
  fieldErrors?: Partial<Record<'phone' | 'pin' | 'pulseRole', string>>;
};

export async function registerAction(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const parsed = RegisterSchema.safeParse({
    phone: formData.get('phone'),
    pin: formData.get('pin'),
    pulseRole: formData.get('pulseRole'),
  });

  if (!parsed.success) {
    const fieldErrors: RegisterFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as 'phone' | 'pin' | 'pulseRole';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const result = await registerWithPhone({
    phone: parsed.data.phone,
    pin: parsed.data.pin,
    pulseRole: parsed.data.pulseRole,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect('/auth/verify?phone=' + encodeURIComponent(result.phoneE164));
}
