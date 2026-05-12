import type { Property, PropertySource, PropertyType } from '../types';

// Fecha base de los mocks. Mantener fija para evitar hydration mismatch en SSR.
export const MOCK_TODAY = new Date('2026-05-10T10:00:00Z');

export function daysAgo(n: number, base: Date = MOCK_TODAY): Date {
  return new Date(base.getTime() - n * 86_400_000);
}

export function hoursAgo(n: number, base: Date = MOCK_TODAY): Date {
  return new Date(base.getTime() - n * 3_600_000);
}

export interface PropertyInput {
  id: string;
  source: PropertySource;
  type: PropertyType;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  lat: number;
  lng: number;
  m2: number;
  rooms: number;
  bathrooms: number;
  price: number;
  zoneAvgPricePerM2: number;
  yearBuilt?: number;
  description: string;
  seenDaysAgo?: number;
  seenHoursAgo?: number;
}

const SOURCE_URL_PREFIX: Record<PropertySource, string> = {
  idealista: 'https://www.idealista.com/inmueble',
  fotocasa: 'https://www.fotocasa.es/es/comprar/vivienda',
  habitaclia: 'https://www.habitaclia.com/comprar-vivienda',
  pisos: 'https://www.pisos.com/comprar',
  boe: 'https://subastas.boe.es/detalleSubasta.php?idSub',
  sareb: 'https://www.servihabitat.com/inmueble',
  aliseda: 'https://www.aliseda.es/propiedad',
  solvia: 'https://www.solvia.es/inmueble',
  haya: 'https://www.haya.es/inmueble',
  casaktua: 'https://www.casaktua.com/inmueble',
  anida: 'https://www.anida.es/inmueble',
};

export function mkProperty(input: PropertyInput): Property {
  const pricePerM2 = input.price / input.m2;
  const baseDelta = (input.zoneAvgPricePerM2 - pricePerM2) / input.zoneAvgPricePerM2;
  const score = Math.max(0, Math.min(100, baseDelta * 200));
  const firstSeen = input.seenHoursAgo
    ? hoursAgo(input.seenHoursAgo)
    : daysAgo(input.seenDaysAgo ?? 1);

  return {
    id: input.id,
    source: input.source,
    sourceId: `${input.source}-${input.id}`,
    sourceUrl: `${SOURCE_URL_PREFIX[input.source]}/${input.id}`,
    type: input.type,
    address: input.address,
    city: input.city,
    postalCode: input.postalCode,
    province: input.province,
    lat: input.lat,
    lng: input.lng,
    cadastralRef: null,
    m2: input.m2,
    rooms: input.rooms,
    bathrooms: input.bathrooms,
    yearBuilt: input.yearBuilt ?? null,
    price: input.price,
    pricePerM2: Math.round(pricePerM2),
    zoneAvgPricePerM2: input.zoneAvgPricePerM2,
    opportunityScore: Math.round(score * 10) / 10,
    status: 'active',
    description: input.description,
    firstSeen,
    lastSeen: firstSeen,
  };
}
