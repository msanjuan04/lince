// Sesión y agencia placeholder para sprint 1 (auth real llega en Fase 2).
// Solo el usuario actual (Marc) — sin equipo ficticio. Cuando Auth.js v5 esté
// activo, esto se reemplaza por session real de Supabase.

import type { Agency, AgencyMember, User } from '../types';
import { daysAgo } from './_helpers';

export const currentAgency: Agency = {
  id: 'agency-dev',
  name: 'Lince (desarrollo)',
  plan: 'founder',
  active: true,
  createdAt: daysAgo(3),
};

export const currentUser: User = {
  id: 'user-marc',
  email: 'marc@gnerai.com',
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
