import type { Capture, CaptureStatus } from '../types';
import { daysAgo, hoursAgo } from './_helpers';
import { currentAgency } from './agency';
import { propertiesMock } from './properties';

interface CaptureSeed {
  id: string;
  propertyId: string;
  status: CaptureStatus;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  notes: string | null;
  createdDaysAgo: number;
  contactedHoursAgo?: number;
  signedDaysAgo?: number;
  dealValue?: number;
  proposalPdfUrl?: string | null;
}

const CAPTURE_SEEDS: CaptureSeed[] = [
  {
    id: 'cap-001',
    propertyId: 'prop-001',
    status: 'new',
    ownerName: null,
    ownerPhone: null,
    ownerEmail: null,
    notes: 'Detectado hoy. Buscar contacto del propietario en el catastro.',
    createdDaysAgo: 0,
  },
  {
    id: 'cap-002',
    propertyId: 'prop-008',
    status: 'new',
    ownerName: 'Joaquim Molins',
    ownerPhone: '+34 666 12 34 56',
    ownerEmail: null,
    notes: 'Vecino conocido de Laura, contacto directo.',
    createdDaysAgo: 0,
  },
  {
    id: 'cap-003',
    propertyId: 'prop-013',
    status: 'new',
    ownerName: null,
    ownerPhone: null,
    ownerEmail: null,
    notes: 'Score 95. Acción rápida.',
    createdDaysAgo: 0,
  },

  // contacted (4)
  {
    id: 'cap-004',
    propertyId: 'prop-010',
    status: 'contacted',
    ownerName: 'Maria Puig',
    ownerPhone: '+34 678 90 12 34',
    ownerEmail: 'maria.puig@gmail.com',
    notes: 'Llamada inicial. Pide propuesta de captación por email.',
    createdDaysAgo: 1,
    contactedHoursAgo: 14,
    proposalPdfUrl: '/mock/propuestas/cap-004.pdf',
  },
  {
    id: 'cap-005',
    propertyId: 'prop-019',
    status: 'contacted',
    ownerName: 'Família Roca-Vidal',
    ownerPhone: '+34 619 87 65 43',
    ownerEmail: 'jordi.roca@hotmail.com',
    notes: 'Pareja en proceso de separación. Quieren cerrar venta antes de junio.',
    createdDaysAgo: 2,
    contactedHoursAgo: 30,
  },
  {
    id: 'cap-006',
    propertyId: 'prop-007',
    status: 'contacted',
    ownerName: 'Anna Benet',
    ownerPhone: '+34 633 22 11 00',
    ownerEmail: 'anna.benet@yahoo.es',
    notes: 'Está comparando con otras 2 inmobiliarias.',
    createdDaysAgo: 3,
    contactedHoursAgo: 50,
  },
  {
    id: 'cap-007',
    propertyId: 'prop-016',
    status: 'contacted',
    ownerName: 'Sergi Pons',
    ownerPhone: '+34 645 33 22 11',
    ownerEmail: null,
    notes: 'WhatsApp respondido. Pide pasar a verlo.',
    createdDaysAgo: 1,
    contactedHoursAgo: 6,
  },

  // meeting (2)
  {
    id: 'cap-008',
    propertyId: 'prop-022',
    status: 'meeting',
    ownerName: 'Carles Esteve',
    ownerPhone: '+34 690 11 22 33',
    ownerEmail: 'carles.esteve@gmail.com',
    notes: 'Visita programada miércoles 12 a las 17h. Va a comparar propuesta con Engel & Völkers.',
    createdDaysAgo: 5,
    contactedHoursAgo: 72,
    proposalPdfUrl: '/mock/propuestas/cap-008.pdf',
  },
  {
    id: 'cap-009',
    propertyId: 'prop-014',
    status: 'meeting',
    ownerName: 'Família Cabré',
    ownerPhone: '+34 615 44 55 66',
    ownerEmail: 'mireia.cabre@telefonica.es',
    notes: 'Reunión presencial el viernes en su oficina.',
    createdDaysAgo: 4,
    contactedHoursAgo: 60,
    proposalPdfUrl: '/mock/propuestas/cap-009.pdf',
  },

  // signed (2)
  {
    id: 'cap-010',
    propertyId: 'prop-005',
    status: 'signed',
    ownerName: 'Hereus Família Vilaseca',
    ownerPhone: '+34 627 99 88 77',
    ownerEmail: 'rosa.vilaseca@gmail.com',
    notes: 'Exclusiva firmada por 6 meses. 3% honorarios.',
    createdDaysAgo: 14,
    contactedHoursAgo: 240,
    signedDaysAgo: 7,
    dealValue: 580_000,
    proposalPdfUrl: '/mock/propuestas/cap-010.pdf',
  },
  {
    id: 'cap-011',
    propertyId: 'prop-026',
    status: 'signed',
    ownerName: 'Mireia Aragó',
    ownerPhone: '+34 656 12 34 56',
    ownerEmail: 'mireia.arago@gmail.com',
    notes: 'Contrato firmado, fotos profesionales programadas.',
    createdDaysAgo: 10,
    contactedHoursAgo: 200,
    signedDaysAgo: 3,
    dealValue: 215_000,
    proposalPdfUrl: '/mock/propuestas/cap-011.pdf',
  },

  // lost (1)
  {
    id: 'cap-012',
    propertyId: 'prop-002',
    status: 'lost',
    ownerName: 'Eduard Fontanella',
    ownerPhone: '+34 661 77 88 99',
    ownerEmail: 'edu.fontanella@gmail.com',
    notes: 'Optó por Tecnocasa. No volver a contactar en 6 meses.',
    createdDaysAgo: 12,
    contactedHoursAgo: 180,
  },
];

const propertyById = new Map(propertiesMock.map((p) => [p.id, p]));

export const capturesMock: Capture[] = CAPTURE_SEEDS.map((seed) => {
  const property = propertyById.get(seed.propertyId);
  if (!property) {
    throw new Error(`Mock capture ${seed.id} referencia property inexistente: ${seed.propertyId}`);
  }
  return {
    id: seed.id,
    agencyId: currentAgency.id,
    propertyId: seed.propertyId,
    status: seed.status,
    notes: seed.notes,
    ownerName: seed.ownerName,
    ownerPhone: seed.ownerPhone,
    ownerEmail: seed.ownerEmail,
    proposalPdfUrl: seed.proposalPdfUrl ?? null,
    contactedAt: seed.contactedHoursAgo !== undefined ? hoursAgo(seed.contactedHoursAgo) : null,
    signedAt: seed.signedDaysAgo !== undefined ? daysAgo(seed.signedDaysAgo) : null,
    dealValue: seed.dealValue ?? null,
    createdAt: daysAgo(seed.createdDaysAgo),
    updatedAt: daysAgo(seed.createdDaysAgo),
    property,
  };
});
