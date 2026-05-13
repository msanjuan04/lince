// Helpers de OTP: generación, hash, verificación.
// Hash con HMAC-SHA256 usando AUTH_SECRET — rápido, constante en tiempo, suficiente
// para un secreto de 10 minutos. No es necesario bcrypt para OTPs efímeros.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const OTP_MIN_INTERVAL_MS = 60 * 1000; // 1 minuto entre reenvíos
const OTP_MAX_ATTEMPTS = 5;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('@lince/auth: AUTH_SECRET no configurado.');
  }
  return secret;
}

/** Genera un OTP de 6 dígitos criptográficamente aleatorio. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  return createHmac('sha256', getSecret()).update(code).digest('hex');
}

/** Comparación constante en tiempo. */
export function verifyOtpHash(code: string, hash: string): boolean {
  const expected = hashOtp(code);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const OTP_CONFIG = {
  ttlMs: OTP_TTL_MS,
  minIntervalMs: OTP_MIN_INTERVAL_MS,
  maxAttempts: OTP_MAX_ATTEMPTS,
} as const;
