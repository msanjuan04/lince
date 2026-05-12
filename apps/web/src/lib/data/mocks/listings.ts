import type { Listing, ListingLead, ListingLeadStatus, ListingStatus } from '../types';
import { daysAgo, hoursAgo } from './_helpers';
import { currentAgency } from './agency';
import { capturesMock } from './captures';

interface ListingSeed {
  id: string;
  captureId: string;
  status: ListingStatus;
  price: number;
  distributedTo: string[];
  viewsCount: number;
  leadsCount: number;
  createdDaysAgo: number;
  hasStaging: boolean;
}

const LISTING_SEEDS: ListingSeed[] = [
  {
    id: 'list-001',
    captureId: 'cap-010',
    status: 'live',
    price: 595_000,
    distributedTo: ['idealista', 'fotocasa', 'habitaclia', 'web-propia'],
    viewsCount: 1284,
    leadsCount: 17,
    createdDaysAgo: 6,
    hasStaging: true,
  },
  {
    id: 'list-002',
    captureId: 'cap-011',
    status: 'live',
    price: 219_000,
    distributedTo: ['idealista', 'fotocasa'],
    viewsCount: 532,
    leadsCount: 6,
    createdDaysAgo: 2,
    hasStaging: true,
  },
];

const captureById = new Map(capturesMock.map((c) => [c.id, c]));

export const listingsMock: Listing[] = LISTING_SEEDS.map((seed) => {
  const capture = captureById.get(seed.captureId);
  if (!capture) {
    throw new Error(`Mock listing ${seed.id} referencia capture inexistente: ${seed.captureId}`);
  }
  const property = capture.property;
  const stagedPhotos = seed.hasStaging
    ? [
        {
          url: '/mock/photos/staged-1.webp',
          alt: `${property.address} — salón con home staging IA`,
          order: 0,
        },
        {
          url: '/mock/photos/staged-2.webp',
          alt: `${property.address} — dormitorio con home staging IA`,
          order: 1,
        },
      ]
    : [];

  return {
    id: seed.id,
    captureId: seed.captureId,
    agencyId: currentAgency.id,
    fichaSeoText: null,
    photos: [
      { url: '/mock/photos/photo-1.webp', alt: `${property.address} — fachada`, order: 0 },
      { url: '/mock/photos/photo-2.webp', alt: `${property.address} — salón`, order: 1 },
      { url: '/mock/photos/photo-3.webp', alt: `${property.address} — cocina`, order: 2 },
    ],
    stagingPhotos: stagedPhotos,
    price: seed.price,
    status: seed.status,
    distributedTo: seed.distributedTo,
    viewsCount: seed.viewsCount,
    leadsCount: seed.leadsCount,
    createdAt: daysAgo(seed.createdDaysAgo),
    property,
  };
});

interface ListingLeadSeed {
  id: string;
  listingId: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  message: string | null;
  status: ListingLeadStatus;
  createdHoursAgo: number;
}

const LEAD_SEEDS: ListingLeadSeed[] = [
  {
    id: 'lead-001',
    listingId: 'list-001',
    name: 'David Carrasco',
    email: 'david.carrasco@gmail.com',
    phone: '+34 644 12 34 56',
    source: 'idealista',
    message: 'Estoy interesado, ¿se puede visitar este sábado?',
    status: 'new',
    createdHoursAgo: 3,
  },
  {
    id: 'lead-002',
    listingId: 'list-001',
    name: 'Núria Camps',
    email: 'nuria.camps@hotmail.com',
    phone: null,
    source: 'fotocasa',
    message: '¿Es negociable el precio? Vivo cerca y conozco la finca.',
    status: 'contacted',
    createdHoursAgo: 18,
  },
  {
    id: 'lead-003',
    listingId: 'list-001',
    name: 'Marc Tarradellas',
    email: 'marc.tarra@gmail.com',
    phone: '+34 660 99 88 77',
    source: 'idealista',
    message: 'Inversor. Pago al contado si las condiciones cuadran.',
    status: 'qualified',
    createdHoursAgo: 40,
  },
  {
    id: 'lead-004',
    listingId: 'list-002',
    name: 'Familia Pujol',
    email: 'pujol.family@gmail.com',
    phone: '+34 622 11 33 44',
    source: 'fotocasa',
    message: 'Buscamos segunda residencia, encajaría perfecto.',
    status: 'new',
    createdHoursAgo: 8,
  },
];

export const listingLeadsMock: ListingLead[] = LEAD_SEEDS.map((seed) => ({
  id: seed.id,
  listingId: seed.listingId,
  agencyId: currentAgency.id,
  name: seed.name,
  email: seed.email,
  phone: seed.phone,
  source: seed.source,
  message: seed.message,
  status: seed.status,
  createdAt: hoursAgo(seed.createdHoursAgo),
}));
