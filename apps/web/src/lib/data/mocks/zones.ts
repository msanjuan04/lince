import type { Zone } from '../types';
import { daysAgo } from './_helpers';
import { currentAgency } from './agency';
import { propertiesMock } from './properties';

interface ZoneSeed {
  id: string;
  name: string;
  postalCodes: string[];
  filters: Zone['filters'];
  alertChannels: Zone['alertChannels'];
  active: boolean;
  createdAgo: number;
}

const ZONE_SEEDS: ZoneSeed[] = [
  {
    id: 'zone-001',
    name: 'Eixample Esquerra + Sant Antoni',
    postalCodes: ['08015', '08036', '08011'],
    filters: { minScore: 65, maxPrice: 600_000, types: ['piso', 'atico'], minRooms: 2 },
    alertChannels: ['email', 'whatsapp'],
    active: true,
    createdAgo: 26,
  },
  {
    id: 'zone-002',
    name: 'Vila de Gràcia',
    postalCodes: ['08012', '08024', '08025', '08023'],
    filters: { minScore: 70, maxPrice: 500_000, types: ['piso'], minRooms: null },
    alertChannels: ['whatsapp'],
    active: true,
    createdAgo: 21,
  },
  {
    id: 'zone-003',
    name: 'Maresme Centro',
    postalCodes: ['08301', '08303', '08310', '08330', '08340'],
    filters: { minScore: 60, maxPrice: 400_000, types: ['piso', 'casa'], minRooms: 3 },
    alertChannels: ['email'],
    active: true,
    createdAgo: 14,
  },
  {
    id: 'zone-004',
    name: 'Costa Brava — Begur / Palamós',
    postalCodes: ['17255', '17230', '17220'],
    filters: { minScore: 70, maxPrice: 800_000, types: ['casa', 'piso'], minRooms: 3 },
    alertChannels: ['email', 'whatsapp'],
    active: false,
    createdAgo: 8,
  },
];

function countMatching(seed: ZoneSeed): { matching: number; newToday: number } {
  const matching = propertiesMock.filter((p) => {
    if (!seed.postalCodes.includes(p.postalCode)) return false;
    if (p.opportunityScore < seed.filters.minScore) return false;
    if (seed.filters.maxPrice !== null && p.price > seed.filters.maxPrice) return false;
    if (seed.filters.types.length > 0 && !seed.filters.types.includes(p.type)) return false;
    if (seed.filters.minRooms !== null && p.rooms < seed.filters.minRooms) return false;
    return true;
  });

  const oneDayAgo = Date.now() - 86_400_000;
  const newToday = matching.filter((p) => p.firstSeen.getTime() > oneDayAgo).length;

  return { matching: matching.length, newToday };
}

export const zonesMock: Zone[] = ZONE_SEEDS.map((seed) => {
  const { matching, newToday } = countMatching(seed);
  return {
    id: seed.id,
    agencyId: currentAgency.id,
    name: seed.name,
    postalCodes: seed.postalCodes,
    filters: seed.filters,
    alertChannels: seed.alertChannels,
    active: seed.active,
    createdAt: daysAgo(seed.createdAgo),
    matchingCount: matching,
    newToday,
  };
});
