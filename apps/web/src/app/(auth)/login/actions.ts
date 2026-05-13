'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { loginWithPhone } from '@lince/auth/server';

const LoginSchema = z.object({
  phone: z.string().min(9, 'Móvil no válido'),
  pin: z.string().regex(/^\d{6}$/, 'El código debe ser exactamente 6 dígitos'),
});

export type LoginFormState = {
  error?: string;
  fieldErrors?: Partial<Record<'phone' | 'pin', string>>;
};

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = LoginSchema.safeParse({
    phone: formData.get('phone'),
    pin: formData.get('pin'),
  });
  if (!parsed.success) {
    const fieldErrors: LoginFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as 'phone' | 'pin';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const result = await loginWithPhone({ phone: parsed.data.phone, pin: parsed.data.pin });
  if (!result.ok) {
    return { error: result.error };
  }
  redirect('/dashboard');
}
