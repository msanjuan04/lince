// Pipeline cliente: recibe propiedades del server con flipEstimate calculado
// con defaults, las recalcula localmente cuando cambia €/m² reforma, y aplica
// los filtros del panel flip. Memoizado.
//
// NO toca DB. NO refetch. Pure compute en RAM sobre el array que ya tienes.

import { useMemo } from 'react';
import { computeFlipEstimate, FLIP_DEFAULTS } from '@lince/ai';
import type { FlipEstimateView, Property } from '@/lib/data/types';
import type { FlipFilterState } from './FlipFilters';

export function useFlipPipeline(
  properties: Property[],
  filters: FlipFilterState,
): { filtered: Property[]; total: number; passedFilters: number } {
  return useMemo(() => {
    const total = properties.length;
    // 1) Recalcular flipEstimate si €/m² reforma difiere del default usado
    //    en server (FLIP_DEFAULTS.eurM2Reform = 700).
    const recalculated =
      filters.eurM2Reform === FLIP_DEFAULTS.eurM2Reform
        ? properties
        : properties.map((p) => recomputeFlip(p, filters.eurM2Reform));

    // 2) Aplicar filtros del panel flip
    const filtered = recalculated.filter((p) => passesFilters(p, filters));

    return { filtered, total, passedFilters: filtered.length };
  }, [properties, filters]);
}

function recomputeFlip(p: Property, eurM2Reform: number): Property {
  if (!p.flipEstimate || p.price === null || p.m2 === null) return p;

  const result = computeFlipEstimate({
    listPrice: p.price,
    m2: p.m2,
    eurM2Reform,
    expectedSaleEurM2: p.flipEstimate.expectedSaleEurM2,
    expectedSaleSource: p.flipEstimate.expectedSaleSource,
    monthsToSell: p.flipEstimate.params.monthsToSell,
  });

  const newEstimate: FlipEstimateView = {
    acquisitionCostTotal: result.acquisitionCostTotal,
    reformCost: result.reformCost,
    totalInvestment: result.totalInvestment,
    expectedSalePrice: result.expectedSalePrice,
    expectedSaleEurM2: p.flipEstimate.expectedSaleEurM2,
    expectedSaleSource: p.flipEstimate.expectedSaleSource,
    netSaleProceeds: result.netSaleProceeds,
    grossMarginEur: result.grossMarginEur,
    grossMarginPct: result.grossMarginPct,
    cycleMonths: result.cycleMonths,
    annualizedMarginPct: result.annualizedMarginPct,
    reasons: result.reasons,
    breakdown: result.breakdown,
    params: { eurM2Reform, monthsToSell: p.flipEstimate.params.monthsToSell },
  };

  return { ...p, flipEstimate: newEstimate };
}

function passesFilters(p: Property, f: FlipFilterState): boolean {
  // Tier de zona
  if (p.marketReference) {
    if (!f.tiers.has(p.marketReference.tier)) return false;
    if (f.excludeNegativeMomentum && p.marketReference.momentum === 'negative') return false;
  } else {
    // Sin referencia de zona → solo pasa si está aceptado todo (sin filtro de tier)
    if (f.tiers.size < 4) return false;
  }

  // m²
  if (f.minM2 !== null) {
    if (p.m2 === null || p.m2 < f.minM2) return false;
  }
  if (f.maxM2 !== null) {
    if (p.m2 === null || p.m2 > f.maxM2) return false;
  }

  // Económicos del flip
  const fe = p.flipEstimate;
  if (
    f.maxTotalInvestment !== null ||
    f.minGrossMarginEur !== null ||
    f.minGrossMarginPct !== null
  ) {
    if (!fe) return false;
  }

  if (f.maxTotalInvestment !== null) {
    if (fe?.totalInvestment === null || fe?.totalInvestment === undefined) return false;
    if (fe.totalInvestment > f.maxTotalInvestment) return false;
  }
  if (f.minGrossMarginEur !== null) {
    if (fe?.grossMarginEur === null || fe?.grossMarginEur === undefined) return false;
    if (fe.grossMarginEur < f.minGrossMarginEur) return false;
  }
  if (f.minGrossMarginPct !== null) {
    if (fe?.grossMarginPct === null || fe?.grossMarginPct === undefined) return false;
    if (fe.grossMarginPct * 100 < f.minGrossMarginPct) return false;
  }

  return true;
}
