// Modelo de un chollo (deal) + datos mock. Basado en la forma real de los
// chollos que el backend Lince ya detecta (crawler + scoring) y en los deals
// off-market que subirán los "linces". Se sustituirá por Supabase.

import type { DealFeed } from '@/constants/brand';

export interface Deal {
  id: string;
  feed: DealFeed; // 'offmarket' (lo sube un lince) | 'ia' (lo detecta el crawler)
  title: string;
  city: string;
  postalCode: string;
  price: number;
  m2: number | null;
  rooms: number | null;
  pricePerM2: number | null;
  zoneAvgPricePerM2: number | null; // €/m² mediano de la zona
  /** % por debajo del €/m² de la zona (0.24 = 24% más barato). */
  belowZonePct: number | null;
  source: string; // 'lince' para off-market; 'solvia'/'aliseda'/... para IA
  imageUrl: string;
  /** Fecha de publicación / detección (ISO). */
  publishedAt: string;
  /** Datos Catastro (públicos). */
  catastro?: { yearBuilt?: number; surfaceM2?: number; use?: string } | null;
  /** Solo IA: link al anuncio original. */
  sourceUrl?: string | null;
  /** Solo off-market: comisión ofrecida al que traiga comprador. */
  commissionPct?: number | null;
  /** Nº de inversores interesados. */
  interested: number;
}

function belowPct(eur: number, zone: number): number {
  return Math.round(((zone - eur) / zone) * 100) / 100;
}

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`;

export const MOCK_DEALS: Deal[] = [
  {
    id: 'off-1',
    feed: 'offmarket',
    title: 'Piso a reformar, herencia sin publicar',
    city: 'L’Hospitalet de Llobregat',
    postalCode: '08902',
    price: 148000,
    m2: 72,
    rooms: 3,
    pricePerM2: 2056,
    zoneAvgPricePerM2: 2980,
    belowZonePct: belowPct(2056, 2980),
    source: 'lince',
    imageUrl: IMG('photo-1560448204-e02f11c3d0e2'),
    publishedAt: '2026-07-22T09:10:00Z',
    catastro: { yearBuilt: 1968, surfaceM2: 74, use: 'Residencial' },
    commissionPct: 3,
    interested: 7,
  },
  {
    id: 'off-2',
    feed: 'offmarket',
    title: 'Dúplex con terraza, propietario vende directo',
    city: 'Badalona',
    postalCode: '08912',
    price: 195000,
    m2: 95,
    rooms: 4,
    pricePerM2: 2053,
    zoneAvgPricePerM2: 2764,
    belowZonePct: belowPct(2053, 2764),
    source: 'lince',
    imageUrl: IMG('photo-1502672260266-1c1ef2d93688'),
    publishedAt: '2026-07-21T18:30:00Z',
    catastro: { yearBuilt: 1979, surfaceM2: 98, use: 'Residencial' },
    commissionPct: 2.5,
    interested: 12,
  },
  {
    id: 'off-3',
    feed: 'offmarket',
    title: 'Casa okupada para inversor, precio de derribo',
    city: 'Terrassa',
    postalCode: '08226',
    price: 92000,
    m2: 110,
    rooms: 4,
    pricePerM2: 836,
    zoneAvgPricePerM2: 2180,
    belowZonePct: belowPct(836, 2180),
    source: 'lince',
    imageUrl: IMG('photo-1570129477492-45c003edd2be'),
    publishedAt: '2026-07-22T07:45:00Z',
    catastro: { yearBuilt: 1962, surfaceM2: 115, use: 'Residencial' },
    commissionPct: 4,
    interested: 21,
  },
  {
    id: 'ia-1',
    feed: 'ia',
    title: 'Piso 3 hab · rebajado por el banco',
    city: 'Sant Boi de Llobregat',
    postalCode: '08830',
    price: 130000,
    m2: 85,
    rooms: 3,
    pricePerM2: 1529,
    zoneAvgPricePerM2: 2320,
    belowZonePct: belowPct(1529, 2320),
    source: 'altamira',
    imageUrl: IMG('photo-1522708323590-d24dbb6b0267'),
    publishedAt: '2026-07-20T10:00:00Z',
    catastro: { yearBuilt: 1974, surfaceM2: 88, use: 'Residencial' },
    sourceUrl: 'https://www.altamirainmuebles.com/inmueble/421438',
    interested: 5,
  },
  {
    id: 'ia-2',
    feed: 'ia',
    title: 'Vivienda bancaria, Diagonal Mar',
    city: 'Barcelona',
    postalCode: '08019',
    price: 115000,
    m2: 50,
    rooms: 2,
    pricePerM2: 2300,
    zoneAvgPricePerM2: 7831,
    belowZonePct: belowPct(2300, 7831),
    source: 'pisos',
    imageUrl: IMG('photo-1493809842364-78817add7ffb'),
    publishedAt: '2026-07-19T12:00:00Z',
    catastro: { yearBuilt: 1998, surfaceM2: 52, use: 'Residencial' },
    sourceUrl: 'https://www.pisos.com',
    interested: 9,
  },
  {
    id: 'ia-3',
    feed: 'ia',
    title: 'Piso Centre, Solvia · bajo mercado',
    city: 'Sabadell',
    postalCode: '08201',
    price: 96000,
    m2: 80,
    rooms: 3,
    pricePerM2: 1200,
    zoneAvgPricePerM2: 2489,
    belowZonePct: belowPct(1200, 2489),
    source: 'solvia',
    imageUrl: IMG('photo-1512917774080-9991f1c4c750'),
    publishedAt: '2026-07-18T09:30:00Z',
    catastro: { yearBuilt: 1971, surfaceM2: 82, use: 'Residencial' },
    sourceUrl: 'https://www.solvia.es',
    interested: 4,
  },
];

export function dealsByFeed(feed: DealFeed): Deal[] {
  return MOCK_DEALS.filter((d) => d.feed === feed).sort(
    (a, b) => (b.belowZonePct ?? 0) - (a.belowZonePct ?? 0),
  );
}

export function dealById(id: string): Deal | undefined {
  return MOCK_DEALS.find((d) => d.id === id);
}
