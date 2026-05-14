// Estimador de operación flip (comprar → reformar → vender en 7-14 meses).
//
// CERO números inventados. Cada componente con su fuente:
//   - Coste compra: precio anuncio (real) + costes legales (% fijos públicos)
//   - Coste reforma: m² × €/m² reforma (input variable del usuario)
//   - Precio salida: mediana real del CP (crawler Lince) o referencia del
//     informe Idealista/Indomio/Fotocasa abril 2026 (fallback con caveat)
//   - Margen anualizado: aritmética sobre los tres anteriores
//
// Si falta cualquier dato crítico, devolvemos `null` para esa propiedad y
// explicitamos por qué. NO inventamos para "rellenar".

/** Parámetros de coste legal (Catalunya, vivienda usada de segunda mano). */
export const LEGAL_COSTS = {
  /** ITP Catalunya vivienda usada (BOE, 2026). */
  itpPct: 0.1,
  /** Notaría + Registro de la Propiedad (estimación rango oficial Notarios). */
  notaryRegistryPct: 0.015,
};

/** Defaults razonables (todos OVERRIDABLE por el usuario en cada búsqueda). */
export const FLIP_DEFAULTS = {
  /** €/m² reforma calidad media BCN. PLACEHOLDER — calibrar con primer flip real. */
  eurM2Reform: 700,
  /** Meses típicos de reforma + permisos. */
  reformMonths: 3,
  /** Meses típicos compra (firma escritura desde oferta aceptada). */
  acquisitionMonths: 1,
  /** Margen de seguridad por defecto sobre precio salida del informe (no asumimos techo). */
  saleSafetyMarginPct: 0.1,
};

export interface FlipInputs {
  /** Precio de venta anunciado (real, de la fuente). */
  listPrice: number | null;
  /** Superficie del piso (real, de la fuente o catastro). */
  m2: number | null;
  /** €/m² reforma a aplicar — input variable del usuario por búsqueda. */
  eurM2Reform: number;
  /** Precio salida €/m² esperado — del crawler (preferente) o del informe (fallback). */
  expectedSaleEurM2: number | null;
  /** Fuente del expectedSaleEurM2 — para auditoría. */
  expectedSaleSource: string | null;
  /**
   * Meses estimados de salida (desde listing post-reforma hasta arras). Si
   * no se conoce, usar default razonable o null para que el output diga "no
   * calculable".
   */
  monthsToSell: number | null;
  /** Comisión inmobiliaria que pagas al comprar (0-3%, depende caso). */
  acquisitionCommissionPct?: number;
  /** Comisión inmobiliaria que pagas al vender (0-3%). */
  saleCommissionPct?: number;
  /** Meses adicionales de tenencia (entre reforma y venta). */
  extraHoldingMonths?: number;
}

export interface FlipEstimate {
  /** Coste real de adquisición: precio + ITP + notaría + comisión compra. */
  acquisitionCostTotal: number | null;
  /** Coste de reforma estimado. */
  reformCost: number | null;
  /** Inversión total (adquisición + reforma). */
  totalInvestment: number | null;
  /** Precio salida total = expectedSaleEurM2 × m². */
  expectedSalePrice: number | null;
  /** Neto tras venta = precio − comisión venta. */
  netSaleProceeds: number | null;
  /** Margen bruto € = neto venta − inversión total. */
  grossMarginEur: number | null;
  /** Margen % sobre inversión total. */
  grossMarginPct: number | null;
  /** Duración total del ciclo en meses (compra + reforma + venta + holding). */
  cycleMonths: number | null;
  /** Margen anualizado = margen% × (12 / ciclomeses). */
  annualizedMarginPct: number | null;
  /**
   * Lista de razones por las que algún campo no pudo calcularse. Si está vacía,
   * todos los outputs son válidos.
   */
  reasons: string[];
  /** Resumen humano del cálculo paso a paso (auditable). */
  breakdown: string[];
}

/**
 * Calcula la estimación flip. Si falta cualquier input crítico, devuelve el
 * objeto con campos null y `reasons` explicando qué falta. NUNCA inventa.
 */
export function computeFlipEstimate(inputs: FlipInputs): FlipEstimate {
  const reasons: string[] = [];
  const breakdown: string[] = [];

  // Validar inputs mínimos
  if (inputs.listPrice === null || inputs.listPrice <= 0) {
    reasons.push('Sin precio anunciado en la fuente.');
  }
  if (inputs.m2 === null || inputs.m2 <= 0) {
    reasons.push('Sin superficie (m²) en la fuente.');
  }
  if (inputs.expectedSaleEurM2 === null || inputs.expectedSaleEurM2 <= 0) {
    reasons.push(
      'Sin precio de salida esperado (ni mediana del crawler ni referencia del informe para este CP).',
    );
  }
  if (inputs.eurM2Reform <= 0) {
    reasons.push('€/m² de reforma debe ser > 0.');
  }

  if (reasons.length > 0) {
    return {
      acquisitionCostTotal: null,
      reformCost: null,
      totalInvestment: null,
      expectedSalePrice: null,
      netSaleProceeds: null,
      grossMarginEur: null,
      grossMarginPct: null,
      cycleMonths: null,
      annualizedMarginPct: null,
      reasons,
      breakdown,
    };
  }

  // En este punto sabemos que los campos requeridos son no-null.
  const listPrice = inputs.listPrice as number;
  const m2 = inputs.m2 as number;
  const expectedSaleEurM2 = inputs.expectedSaleEurM2 as number;
  const reformCostPerM2 = inputs.eurM2Reform;
  const acqCommissionPct = inputs.acquisitionCommissionPct ?? 0;
  const saleCommissionPct = inputs.saleCommissionPct ?? 0;
  const extraHolding = inputs.extraHoldingMonths ?? 0;

  // 1. Coste adquisición
  const itp = listPrice * LEGAL_COSTS.itpPct;
  const notary = listPrice * LEGAL_COSTS.notaryRegistryPct;
  const acqCommission = listPrice * acqCommissionPct;
  const acquisitionCostTotal = listPrice + itp + notary + acqCommission;
  breakdown.push(
    `Compra: ${fmtEur(listPrice)} + ITP 10% ${fmtEur(itp)} + Notaría/Registro 1,5% ${fmtEur(notary)}` +
      (acqCommission > 0
        ? ` + Comisión ${(acqCommissionPct * 100).toFixed(1)}% ${fmtEur(acqCommission)}`
        : '') +
      ` = ${fmtEur(acquisitionCostTotal)}`,
  );

  // 2. Coste reforma
  const reformCost = m2 * reformCostPerM2;
  breakdown.push(`Reforma: ${m2}m² × ${fmtEur(reformCostPerM2)}/m² = ${fmtEur(reformCost)}`);

  // 3. Inversión total
  const totalInvestment = acquisitionCostTotal + reformCost;
  breakdown.push(`Inversión total: ${fmtEur(totalInvestment)}`);

  // 4. Precio salida
  const expectedSalePrice = m2 * expectedSaleEurM2;
  const sourceNote = inputs.expectedSaleSource ? ` (fuente: ${inputs.expectedSaleSource})` : '';
  breakdown.push(
    `Salida: ${m2}m² × ${fmtEur(expectedSaleEurM2)}/m² = ${fmtEur(expectedSalePrice)}${sourceNote}`,
  );

  // 5. Comisión venta + neto
  const saleCommission = expectedSalePrice * saleCommissionPct;
  const netSaleProceeds = expectedSalePrice - saleCommission;
  if (saleCommission > 0) {
    breakdown.push(
      `Comisión venta ${(saleCommissionPct * 100).toFixed(1)}%: -${fmtEur(saleCommission)} → Neto ${fmtEur(netSaleProceeds)}`,
    );
  }

  // 6. Margen bruto
  const grossMarginEur = netSaleProceeds - totalInvestment;
  const grossMarginPct = grossMarginEur / totalInvestment;
  breakdown.push(
    `Margen: ${fmtEur(netSaleProceeds)} − ${fmtEur(totalInvestment)} = ${fmtEur(grossMarginEur)} (${(grossMarginPct * 100).toFixed(1)}% sobre inversión)`,
  );

  // 7. Ciclo y anualización
  let cycleMonths: number | null = null;
  let annualizedMarginPct: number | null = null;
  if (inputs.monthsToSell !== null && inputs.monthsToSell > 0) {
    cycleMonths =
      FLIP_DEFAULTS.acquisitionMonths +
      FLIP_DEFAULTS.reformMonths +
      inputs.monthsToSell +
      extraHolding;
    annualizedMarginPct = grossMarginPct * (12 / cycleMonths);
    breakdown.push(
      `Ciclo: ${FLIP_DEFAULTS.acquisitionMonths} compra + ${FLIP_DEFAULTS.reformMonths} reforma + ${inputs.monthsToSell} venta` +
        (extraHolding > 0 ? ` + ${extraHolding} holding` : '') +
        ` = ${cycleMonths} meses → anualizado ${(annualizedMarginPct * 100).toFixed(1)}%/año`,
    );
  } else {
    reasons.push(
      'Ciclo no calculable: meses-hasta-venta desconocido (sin histórico de absorción real del CP todavía).',
    );
  }

  return {
    acquisitionCostTotal,
    reformCost,
    totalInvestment,
    expectedSalePrice,
    netSaleProceeds,
    grossMarginEur,
    grossMarginPct,
    cycleMonths,
    annualizedMarginPct,
    reasons,
    breakdown,
  };
}

function fmtEur(n: number): string {
  return Math.round(n).toLocaleString('es-ES') + '€';
}
