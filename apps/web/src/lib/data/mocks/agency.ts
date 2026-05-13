// Sesión y agencia placeholder para sprint 1 (auth real llega en Fase 2).
// Solo el usuario actual (Marc) — sin equipo ficticio. Cuando Auth.js v5 esté
// activo, esto se reemplaza por session real de Supabase.

import type { Agency, AgencyMember, User } from '../types';
import { daysAgo } from './_helpers';

// UUIDs fijos para la agency/usuario demo (mientras no hay Auth.js).
// Las server actions persisten zonas/captures con este agencyId — debe ser
// un UUID válido para que Postgres no lance "invalid character" al insert.
export const DEMO_AGENCY_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

export const currentAgency: Agency = {
  id: DEMO_AGENCY_ID,
  name: 'Lince (desarrollo)',
  plan: 'founder',
  active: true,
  createdAt: daysAgo(3),
};

export const currentUser: User = {
  id: DEMO_USER_ID,
  email: 'marc@gnerai.com',
  phoneE164: null,
  name: 'Marc Sanjuan',
  createdAt: daysAgo(3),
};

// Solo el owner real (Marc) hasta que haya invitaciones por Auth.js
export const agencyMembersMock: AgencyMember[] = [
  {
    agencyId: currentAgency.id,
    userId: currentUser.id,
    role: 'owner',
    user: currentUser,
  },
];
