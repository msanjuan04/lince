// Server-only auth para Lince. Flujo phone+WhatsApp OTP.
//
// Flow:
//  1. registerWithPhone(phone, pin, role)
//       → crea auth.users en Supabase (admin, sin phone_confirmed)
//       → crea our users row (con phone_e164, supabase_user_id)
//       → genera OTP, lo hashea, lo guarda, lo envía por WhatsApp
//  2. verifyOtp(phone, otp)
//       → comprueba hash + expiry + intentos
//       → marca whatsapp_verified_at + phone_confirmed en auth.users
//       → sign in con phone+pin → devuelve session
//  3. loginWithPhone(phone, pin)
//       → sign in con phone+pin (Supabase). Si no está whatsapp_verified, lanza.

import { createServerClient as createServerClientSsr, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { prisma } from '@lince/db';
import type { PulseRole } from '@lince/db';
import { WhatsAppClient, getWhatsAppConfigFromEnv, normalizeE164 } from '@lince/notifier';
import { getSupabaseAdminClient } from './admin';
import { generateOtpCode, hashOtp, verifyOtpHash, OTP_CONFIG } from './otp';
import type { LinceSession } from './session';

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      '@lince/auth: faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.',
    );
  }
  return { url, anonKey };
}

/** Cliente Supabase para Server Components / Server Actions. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClientSsr(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // Llamado desde un Server Component (read-only).
        }
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Flujo de registro / verify / login
// ─────────────────────────────────────────────────────────────────────────────

export type RegisterResult = { ok: true; phoneE164: string } | { ok: false; error: string };

export async function registerWithPhone(input: {
  phone: string;
  pin: string;
  pulseRole: PulseRole;
  name?: string | null;
}): Promise<RegisterResult> {
  const phoneE164 = normalizeE164(input.phone);
  if (!phoneE164) {
    return { ok: false, error: 'Número de móvil no válido.' };
  }
  if (!/^\d{6}$/.test(input.pin)) {
    return { ok: false, error: 'El código debe ser exactamente 6 dígitos.' };
  }

  const existing = await prisma.user.findUnique({ where: { phoneE164 } });
  if (existing?.whatsappVerifiedAt) {
    return {
      ok: false,
      error: 'Este móvil ya está registrado y verificado. Inicia sesión.',
    };
  }

  const admin = getSupabaseAdminClient();
  let supabaseUserId = existing?.supabaseUserId ?? null;

  if (!existing) {
    // Crear auth.users en Supabase, sin confirmar phone. Password = el PIN del user.
    const { data, error } = await admin.auth.admin.createUser({
      phone: phoneE164,
      password: input.pin,
      phone_confirm: false,
      user_metadata: {
        pulse_role: input.pulseRole,
        name: input.name ?? null,
      },
    });
    if (error || !data.user) {
      return { ok: false, error: error?.message ?? 'No se pudo crear el usuario.' };
    }
    supabaseUserId = data.user.id;

    // Crear agency + user + membership en nuestra DB.
    await prisma.$transaction(async (tx) => {
      const agency = await tx.agency.create({
        data: { name: `Cuenta ${phoneE164}`, plan: 'founder', pulseRole: input.pulseRole },
      });
      const u = await tx.user.create({
        data: {
          phoneE164,
          name: input.name ?? null,
          supabaseUserId: supabaseUserId!,
        },
      });
      await tx.agencyMember.create({
        data: { agencyId: agency.id, userId: u.id, role: 'owner' },
      });
    });
  } else if (!existing.supabaseUserId) {
    // Caso raro: fila legacy sin supabase_user_id. Bind ahora.
    const { data, error } = await admin.auth.admin.createUser({
      phone: phoneE164,
      password: input.pin,
      phone_confirm: false,
      user_metadata: { pulse_role: input.pulseRole },
    });
    if (error || !data.user) {
      return { ok: false, error: error?.message ?? 'No se pudo crear el usuario.' };
    }
    supabaseUserId = data.user.id;
    await prisma.user.update({
      where: { id: existing.id },
      data: { supabaseUserId },
    });
  } else {
    // existing.supabaseUserId existe pero no verificado: actualizar password por si la
    // cambió antes de verificar. Idempotente.
    await admin.auth.admin.updateUserById(existing.supabaseUserId, {
      password: input.pin,
      user_metadata: { pulse_role: input.pulseRole },
    });
  }

  const otpResult = await sendOtpToPhone(phoneE164);
  if (!otpResult.ok) {
    return { ok: false, error: otpResult.error };
  }

  return { ok: true, phoneE164 };
}

export type SendOtpResult = { ok: true } | { ok: false; error: string };

/** Genera un OTP, lo hashea, lo guarda en users y lo manda por WhatsApp. */
export async function sendOtpToPhone(phoneRaw: string): Promise<SendOtpResult> {
  const phoneE164 = normalizeE164(phoneRaw);
  if (!phoneE164) return { ok: false, error: 'Número de móvil no válido.' };

  const user = await prisma.user.findUnique({ where: { phoneE164 } });
  if (!user) return { ok: false, error: 'Usuario no encontrado. Regístrate primero.' };

  // Rate limit por usuario: 1 OTP / minuto.
  if (user.whatsappOtpSentAt) {
    const elapsed = Date.now() - user.whatsappOtpSentAt.getTime();
    if (elapsed < OTP_CONFIG.minIntervalMs) {
      const wait = Math.ceil((OTP_CONFIG.minIntervalMs - elapsed) / 1000);
      return { ok: false, error: `Espera ${wait} segundos antes de reenviar el código.` };
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.ttlMs);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      whatsappOtpHash: codeHash,
      whatsappOtpExpiresAt: expiresAt,
      whatsappOtpAttempts: 0,
      whatsappOtpSentAt: new Date(),
    },
  });

  const wa = new WhatsAppClient(getWhatsAppConfigFromEnv());
  const result = await wa.sendOtpTemplate(phoneE164, code);
  if (!result.ok && !result.dryRun) {
    return { ok: false, error: `No se pudo enviar WhatsApp: ${result.error ?? 'desconocido'}` };
  }

  return { ok: true };
}

export type VerifyOtpResult = { ok: true } | { ok: false; error: string };

/**
 * Comprueba el OTP, marca verified, confirma el phone en Supabase y crea la
 * sesión iniciando sesión con phone+pin (que el user re-introduce en el form).
 */
export async function verifyPhoneOtp(input: {
  phone: string;
  otp: string;
  pin: string;
}): Promise<VerifyOtpResult> {
  const phoneE164 = normalizeE164(input.phone);
  if (!phoneE164) return { ok: false, error: 'Número de móvil no válido.' };

  const user = await prisma.user.findUnique({ where: { phoneE164 } });
  if (!user) return { ok: false, error: 'Usuario no encontrado.' };
  if (user.whatsappVerifiedAt) return { ok: false, error: 'Este móvil ya está verificado.' };
  if (!user.whatsappOtpHash || !user.whatsappOtpExpiresAt) {
    return { ok: false, error: 'No hay código pendiente. Solicita uno nuevo.' };
  }
  if (user.whatsappOtpExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'El código ha caducado. Solicita uno nuevo.' };
  }
  if (user.whatsappOtpAttempts >= OTP_CONFIG.maxAttempts) {
    return { ok: false, error: 'Demasiados intentos fallidos. Solicita un código nuevo.' };
  }

  const valid = verifyOtpHash(input.otp, user.whatsappOtpHash);
  if (!valid) {
    await prisma.user.update({
      where: { id: user.id },
      data: { whatsappOtpAttempts: { increment: 1 } },
    });
    return { ok: false, error: 'Código incorrecto.' };
  }

  // OTP válido. Marcar verified + limpiar campos OTP.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      whatsappVerifiedAt: new Date(),
      whatsappOtpHash: null,
      whatsappOtpExpiresAt: null,
      whatsappOtpAttempts: 0,
    },
  });

  // Confirmar phone en Supabase Auth para que signInWithPassword acepte.
  if (user.supabaseUserId) {
    const admin = getSupabaseAdminClient();
    await admin.auth.admin.updateUserById(user.supabaseUserId, { phone_confirm: true });
  }

  // Sign-in con phone+pin para crear la cookie de sesión.
  const supabase = await createSupabaseServerClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    phone: phoneE164,
    password: input.pin,
  });
  if (signInErr) {
    return {
      ok: false,
      error: `Verificación OK, pero el PIN no coincide. Ve a /login. (${signInErr.message})`,
    };
  }

  return { ok: true };
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginWithPhone(input: { phone: string; pin: string }): Promise<LoginResult> {
  const phoneE164 = normalizeE164(input.phone);
  if (!phoneE164) return { ok: false, error: 'Número de móvil no válido.' };
  if (!/^\d{6}$/.test(input.pin)) {
    return { ok: false, error: 'El código debe ser exactamente 6 dígitos.' };
  }

  const user = await prisma.user.findUnique({ where: { phoneE164 } });
  if (!user) return { ok: false, error: 'Móvil o código incorrectos.' };
  if (!user.whatsappVerifiedAt) {
    return {
      ok: false,
      error: 'Tu móvil no está verificado. Revisa tu WhatsApp o solicita un nuevo código.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    phone: phoneE164,
    password: input.pin,
  });
  if (error) {
    return { ok: false, error: 'Móvil o código incorrectos.' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesión: getLinceSession / requireLinceSession
// ─────────────────────────────────────────────────────────────────────────────

export async function getLinceSession(): Promise<LinceSession | null> {
  // Bypass dev: si LINCE_DEV_BYPASS_USER_ID está set (solo permitido fuera de
  // production), saltamos Supabase y resolvemos la sesión por phoneE164.
  // Útil mientras el Phone provider de Supabase está deshabilitado.
  const bypassPhone = process.env['LINCE_DEV_BYPASS_PHONE'];
  if (bypassPhone && process.env['NODE_ENV'] !== 'production') {
    const user = await prisma.user.findUnique({
      where: { phoneE164: bypassPhone },
      include: { memberships: { include: { agency: true } } },
    });
    if (user) {
      const membership = user.memberships[0];
      const agency = membership?.agency;
      if (agency) {
        return {
          supabaseUserId: user.supabaseUserId ?? user.id,
          email: user.email ?? '',
          phoneE164: user.phoneE164 ?? bypassPhone,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phoneE164: user.phoneE164,
          },
          agency: {
            id: agency.id,
            name: agency.name,
            plan: agency.plan,
            pulseRole: agency.pulseRole,
          },
          isOnboarded: !!agency.pulseRole,
        };
      }
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;
  // Phone-only flow: solo aceptamos si tiene phone confirmado.
  if (!supabaseUser.phone || !supabaseUser.phone_confirmed_at) return null;

  let user = await prisma.user.findUnique({
    where: { supabaseUserId: supabaseUser.id },
    include: { memberships: { include: { agency: true } } },
  });

  if (!user) {
    // Fallback por phone.
    user = await prisma.user.findUnique({
      where: { phoneE164: supabaseUser.phone },
      include: { memberships: { include: { agency: true } } },
    });
    if (user && !user.supabaseUserId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { supabaseUserId: supabaseUser.id },
        include: { memberships: { include: { agency: true } } },
      });
    }
  }

  if (!user) return null;
  if (!user.whatsappVerifiedAt) return null;

  const membership = user.memberships[0];
  const agency = membership?.agency;
  if (!agency) return null;

  return {
    supabaseUserId: supabaseUser.id,
    email: user.email ?? '',
    phoneE164: user.phoneE164 ?? supabaseUser.phone,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phoneE164: user.phoneE164,
    },
    agency: {
      id: agency.id,
      name: agency.name,
      plan: agency.plan,
      pulseRole: agency.pulseRole,
    },
    isOnboarded: !!agency.pulseRole,
  };
}

export async function requireLinceSession(): Promise<LinceSession> {
  const session = await getLinceSession();
  if (!session) {
    throw new Error('No autenticado.');
  }
  return session;
}
