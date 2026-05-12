import type { Agency, AgencyMember, User } from '../types';
import { daysAgo } from './_helpers';

export const currentAgency: Agency = {
  id: 'agency-001',
  name: 'Inmobiliaria Sant Antoni',
  plan: 'founder',
  active: true,
  createdAt: daysAgo(28),
};

export const usersMock: User[] = [
  {
    id: 'user-001',
    email: 'marc@inmosantantoni.cat',
    name: 'Marc Sanjuan',
    createdAt: daysAgo(28),
  },
  {
    id: 'user-002',
    email: 'laura@inmosantantoni.cat',
    name: 'Laura Vidal',
    createdAt: daysAgo(25),
  },
  {
    id: 'user-003',
    email: 'pau@inmosantantoni.cat',
    name: 'Pau Riera',
    createdAt: daysAgo(20),
  },
];

export const currentUser: User = usersMock[0]!;

export const agencyMembersMock: AgencyMember[] = [
  {
    agencyId: currentAgency.id,
    userId: 'user-001',
    role: 'owner',
    user: usersMock[0]!,
  },
  {
    agencyId: currentAgency.id,
    userId: 'user-002',
    role: 'agent',
    user: usersMock[1]!,
  },
  {
    agencyId: currentAgency.id,
    userId: 'user-003',
    role: 'agent',
    user: usersMock[2]!,
  },
];
