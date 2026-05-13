'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { verifyPhoneOtp, sendOtpToPhone } from '@lince/auth/server';

const VerifySchema = z.object({
  phone: z.string().min(9, 'Móvil no válido'),
  otp: z.string().regex(/^\d{6}$/, 'El código de WhatsApp son 6 dígitos'),
  pin: z.string().regex(/^\d{6}$/, 'Tu PIN son 6 dígitos'),
});

export type VerifyFormState = {
  error?: string;
  info?: string;
  fieldErrors?: Partial<Record<'phone' | 'otp' | 'pin', string>>;
};

export async function verifyAction(
  _prev: VerifyFormState,
  formData: FormData,
): Promise<VerifyFormState> {
  const parsed = VerifySchema.safeParse({
    phone: formData.get('phone'),
    otp: formData.get('otp'),
    pin: formData.get('pin'),
  });
  if (!parsed.success) {
    const fieldErrors: VerifyFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as 'phone' | 'otp' | 'pin';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const result = await verifyPhoneOtp({
    phone: parsed.data.phone,
    otp: parsed.data.otp,
    pin: parsed.data.pin,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  redirect('/dashboard');
}

export async function resendOtpAction(
  _prev: VerifyFormState,
  formData: FormData,
): Promise<VerifyFormState> {
  const phone = String(formData.get('phone') ?? '');
  if (phone.length < 9) {
    return { error: 'Móvil no válido' };
  }
  const result = await sendOtpToPhone(phone);
  if (!result.ok) {
    return { error: result.error };
  }
  return { info: 'Nuevo código enviado por WhatsApp.' };
}
