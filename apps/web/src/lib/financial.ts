// Análisis financiero por propiedad (heurístico, claramente marcado como
// estimación en la UI). El agente Pulse de Fase 4 podrá enriquecerlo con
// criterio cualitativo.
//
// Benchmarks de mercado para BCN+Catalunya (sprint 1, ajustables):
//   - Alquiler de zona: 17€/m²/mes BCN centro · 14€ resto BCN · 12€ Maresme/Vallès · 11€ resto.
//   - Coste reforma integral: 800€/m² · parcial: 300€/m².
//   - Gastos del propietario sobre renta: 20% (IBI + comunidad + manten + vacancia).
//   - Revalorización media anual de zona BCN: 3%.

import type { Property } from './data/types';

const RENT_BENCHMARK_EUR_M2_MONTH: Record<string, number> = {
  // CPs BCN ciudad de zona prime → alquiler alto
  '08001': 17.5,
  '08002': 19,
  '08003': 19,
  '08008': 18,
  '08009': 18,
  '08010': 18,
  '08011': 16,
  '08015': 16,
  '08017': 19,
  '08019': 15,
  '08025': 15,
  '08026': 14,
  '08036': 17,
};

function rentBenchmarkForProperty(p: Property): number {
  if (p.postalCode) {
    const benchmark = RENT_BENCHMARK_EUR_M2_MONTH[p.postalCode];
    if (benchmark !== undefined) return benchmark;
  }
  if (p.postalCode?.startsWith('08')) {
    // Resto de provincia Barcelona
    return 12;
  }
  if (p.postalCode?.startsWith('17')) return 14; // Girona / Costa Brava media
  if (p.postalCode?.startsWith('43')) return 11; // Tarragona
  if (p.postalCode?.startsWith('25')) return 9; // Lleida
  return 12;
}

export interface FinancialAnalysis {
  estimatedMonthlyRent: number | null;
  grossYieldPct: number | null;
  netYieldPct: number | null;
  reformCostEur: number | null;
  totalEntryCostEur: number | null;
  suggestedOfferEur: number | null;
  suggestedOfferDiscountPct: number | null;
  projectedValueAt5yEur: number | null;
  projectedRoiPct: number | null;
  /** Notas explicando los supuestos usados, para mostrar en la UI. */
  assumptions: string[];
  /** Quality flag: si los datos eran tan flojos que el cálculo es poco fiable. */
  confidence: 'high' | 'medium' | 'low';
}

export function analyzeProperty(p: Property): FinancialAnalysis {
  const assumptions: string[] = [];
  const confidence: FinancialAnalysis['confidence'] =
    p.price && p.m2 && p.postalCode ? 'high' : p.price ? 'medium' : 'low';

  // 1) Renta mensual estimada
  let estimatedMonthlyRent: number | null = null;
  if (p.m2 && p.m2 > 0) {
    const benchmark = rentBenchmarkForProperty(p);
    estimatedMonthlyRent = Math.round(p.m2 * benchmark);
    assumptions.push(`Alquiler estimado a ${benchmark}€/m² (mediana de zona).`);
  }

  // 2) Yield bruto y neto
  let grossYieldPct: number | null = null;
  let netYieldPct: number | null = null;
  if (estimatedMonthlyRent !== null && p.price && p.price > 0) {
    grossYieldPct = (estimatedMonthlyRent * 12) / p.price;
    netYieldPct = grossYieldPct * 0.8; // -20% gastos del propietario
    assumptions.push('Yield neto = bruto × 0.80 (IBI, comunidad, mantenimiento, vacancia).');
  }

  // 3) Coste de reforma (si aplica)
  let reformCostEur: number | null = null;
  if (p.m2 && p.m2 > 0) {
    if (p.condition === 'needs_reform') {
      reformCostEur = Math.round(p.m2 * 800);
      assumptions.push('Reforma integral estimada a 800€/m².');
    } else if (p.condition === 'partial_reform') {
      reformCostEur = Math.round(p.m2 * 300);
      assumptions.push('Reforma parcial estimada a 300€/m².');
    }
  }

  // 4) Coste total de entrada
  const totalEntryCostEur = p.price != null ? p.price + (reformCostEur ?? 0) : null;

  // 5) Oferta sugerida (heurística por bucket)
  let suggestedOfferEur: number | null = null;
  let suggestedOfferDiscountPct: number | null = null;
  if (p.price && p.price > 0) {
    let discountPct: number;
    if (p.isAuction) {
      // Subastas: ya parten de tasación −20-30%. Ofrecemos +5% sobre puja mínima
      // para superar competencia y no quedar fuera. Asumimos que `price` es el
      // valor de salida de subasta.
      discountPct = -0.05; // pagamos 5% MÁS que el precio de salida
      assumptions.push('Subasta BOE: oferta = precio de salida + 5% (margen sobre puja mínima).');
    } else if (p.isBankOwned) {
      // Bank-owned (Solvia, Aliseda): banco quiere salir, negociación abierta.
      discountPct = 0.12;
      assumptions.push('Bank-owned: oferta a −12% (banco quiere salir de balance).');
    } else {
      // Portal mainstream (Pisos.com): depende del descuento ya acumulado en zona.
      // Si la propiedad ya está por debajo de mediana, oferta más conservadora.
      if (p.zoneDeltaPct != null && p.zoneDeltaPct > 0.15) {
        // Ya está claramente por debajo del mercado, no pidamos demasiado más.
        discountPct = 0.05;
        assumptions.push('Propiedad ya −15% bajo mediana de zona: oferta conservadora −5%.');
      } else {
        discountPct = 0.1;
        assumptions.push('Particular/agencia: oferta a −10% (margen de negociación típico).');
      }
    }
    suggestedOfferDiscountPct = discountPct;
    suggestedOfferEur = Math.round(p.price * (1 - discountPct));
  }

  // 6) ROI a 5 años proyectado (compra + reforma + revalorización + alquiler)
  let projectedValueAt5yEur: number | null = null;
  let projectedRoiPct: number | null = null;
  if (totalEntryCostEur && totalEntryCostEur > 0) {
    const appreciationFactor = Math.pow(1.03, 5); // 3% anual zona BCN
    projectedValueAt5yEur = Math.round(totalEntryCostEur * appreciationFactor);
    const rents5y = (estimatedMonthlyRent ?? 0) * 12 * 5 * 0.8; // 5 años × 80% (vacancia)
    const totalReturn = projectedValueAt5yEur - totalEntryCostEur + rents5y;
    projectedRoiPct = totalReturn / totalEntryCostEur;
    assumptions.push('Revalorización 3% anual + 5 años de rentas (80% ocupación).');
  }

  return {
    estimatedMonthlyRent,
    grossYieldPct,
    netYieldPct,
    reformCostEur,
    totalEntryCostEur,
    suggestedOfferEur,
    suggestedOfferDiscountPct,
    projectedValueAt5yEur,
    projectedRoiPct,
    assumptions,
    confidence,
  };
}
