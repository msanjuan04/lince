// Punto de entrada del paquete de auth de Lince.
// SOLO exporta constantes y tipos client-safe. Funciones que tocan next/headers
// o Prisma viven en subpaths server-only:
//   - '@lince/auth/server'      → cliente Supabase server + getLinceSession/requireLinceSession
//   - '@lince/auth/browser'     → cliente Supabase para Client Components
//   - '@lince/auth/middleware'  → helper para src/middleware.ts

export type { LinceSession } from './session';

export const PULSE_ROLES = ['inmobiliaria', 'buying_agent', 'inversor_directo', 'flipper'] as const;
export type PulseRoleLiteral = (typeof PULSE_ROLES)[number];

export const PULSE_ROLE_LABEL: Record<PulseRoleLiteral, string> = {
  inmobiliaria: 'Inmobiliaria tradicional',
  buying_agent: 'Buying agent / personal shopper',
  inversor_directo: 'Inversor directo / patrimonial',
  flipper: 'Flipper / promotor',
};

export const PULSE_ROLE_DESCRIPTION: Record<PulseRoleLiteral, string> = {
  inmobiliaria: 'Captas para revender a particulares',
  buying_agent: 'Buscas oportunidades para clientes inversores',
  inversor_directo: 'Compras para tu propio patrimonio',
  flipper: 'Compras, reformas y revendes en 6-18 meses',
};
