// Export CSV de oportunidades respetando los filtros pasados por query string.
// Se accede desde el botón "Exportar" en /oportunidades — sus filtros activos
// se propagan tal cual.

import type { NextRequest } from 'next/server';
import { getOpportunities } from '@/lib/data/repositories';
import { listMyTracks } from '@/lib/data/tracking';
import type { OpportunityFilters } from '@/lib/data/repositories';
import type { PropertyType } from '@/lib/data/types';
import { analyzeProperty } from '@/lib/financial';

const VALID_TYPES: PropertyType[] = ['piso', 'casa', 'atico', 'duplex', 'local', 'terreno'];

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  // Reusar la misma lógica de parsing que page.tsx
  const filters: OpportunityFilters = {};
  if (params['q']) filters.search = params['q'];
  if (params['cp']) filters.postalCodes = params['cp'].split(',').filter(Boolean);
  if (params['score']) {
    const min = Number(params['score']);
    if (!Number.isNaN(min)) filters.minScore = min;
  }
  if (params['type']) {
    const types = params['type']
      .split(',')
      .filter((t): t is PropertyType => VALID_TYPES.includes(t as PropertyType));
    if (types.length > 0) filters.types = types;
  }
  if (params['maxPrice']) {
    const max = Number(params['maxPrice']);
    if (!Number.isNaN(max)) filters.maxPrice = max;
  }
  if (params['minRooms']) {
    const r = Number(params['minRooms']);
    if (!Number.isNaN(r)) filters.minRooms = r;
  }
  const origin = params['origin'];
  if (origin === 'auction' || origin === 'bank_owned' || origin === 'private') {
    filters.origin = origin;
  }
  const sort = params['sort'];
  if (
    sort === 'delta' ||
    sort === 'price_asc' ||
    sort === 'price_desc' ||
    sort === 'eurm2_asc' ||
    sort === 'new' ||
    sort === 'score'
  ) {
    filters.sort = sort;
  }
  if (params['noRedFlags'] === '1') filters.excludeRedFlags = true;
  if (params['onlyTracked'] === '1') {
    const tracks = await listMyTracks();
    filters.onlyIds = tracks.map((t) => t.propertyId);
    if (filters.onlyIds.length === 0) filters.onlyIds = ['00000000-0000-0000-0000-000000000000'];
  }

  const properties = await getOpportunities(filters);

  // Cabecera CSV. UTF-8 BOM para que Excel detecte tildes.
  const headers = [
    'id',
    'source',
    'source_id',
    'source_url',
    'type',
    'address',
    'city',
    'postal_code',
    'province',
    'lat',
    'lng',
    'm2',
    'rooms',
    'bathrooms',
    'year_built',
    'price_eur',
    'price_per_m2_eur',
    'zone_avg_price_per_m2_eur',
    'zone_sample_size',
    'zone_delta_pct',
    'opportunity_score',
    'condition',
    'has_terrace',
    'has_elevator',
    'floor',
    'orientation',
    'is_auction',
    'is_bank_owned',
    'red_flags',
    'cadastral_ref',
    'estimated_monthly_rent_eur',
    'gross_yield_pct',
    'net_yield_pct',
    'reform_cost_eur',
    'suggested_offer_eur',
    'projected_roi_5y_pct',
    'first_seen',
    'last_seen',
  ];

  const rows: string[] = [headers.join(',')];
  for (const p of properties) {
    const a = analyzeProperty(p);
    rows.push(
      [
        p.id,
        p.source,
        p.sourceId,
        p.sourceUrl,
        p.type,
        p.address,
        p.city,
        p.postalCode,
        p.province,
        p.lat,
        p.lng,
        p.m2,
        p.rooms,
        p.bathrooms,
        p.yearBuilt,
        p.price,
        p.pricePerM2,
        p.zoneAvgPricePerM2,
        p.zoneSampleSize,
        p.zoneDeltaPct !== null ? (p.zoneDeltaPct * 100).toFixed(2) : null,
        p.opportunityScore,
        p.condition,
        p.hasTerrace,
        p.hasElevator,
        p.floor,
        p.orientation,
        p.isAuction,
        p.isBankOwned,
        p.redFlags.join(';'),
        p.cadastralRef,
        a.estimatedMonthlyRent,
        a.grossYieldPct !== null ? (a.grossYieldPct * 100).toFixed(2) : null,
        a.netYieldPct !== null ? (a.netYieldPct * 100).toFixed(2) : null,
        a.reformCostEur,
        a.suggestedOfferEur,
        a.projectedRoiPct !== null ? (a.projectedRoiPct * 100).toFixed(1) : null,
        p.firstSeen.toISOString(),
        p.lastSeen.toISOString(),
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  const csv = '﻿' + rows.join('\n');
  const filename = `lince-oportunidades-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
