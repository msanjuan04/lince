// Tipo público de la sesión Lince. Definido aquí (no en server.ts) para que
// pueda exportarse desde el barrel '@lince/auth' sin arrastrar código server-only.

import type { PulseRole } from '@lince/db';

export interface LinceSession {
  supabaseUserId: string;
  /** Email del usuario (puede estar vacío en el flujo phone-only). */
  email: string;
  /** Móvil E.164 sin '+'. Identificador principal. */
  phoneE164: string;
  user: {
    id: string;
    email: string | null;
    phoneE164: string | null;
    name: string | null;
  };
  agency: {
    id: string;
    name: string;
    plan: 'basic' | 'pro' | 'elite' | 'founder';
    pulseRole: PulseRole | null;
  };
  isOnboarded: boolean;
}
