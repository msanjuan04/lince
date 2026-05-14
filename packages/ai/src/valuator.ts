// Valuator honesto. Política de producto:
//
//   - El "score" es UN SOLO número derivado de UNA cifra verificable: el
//     descuento del precio €/m² vs la mediana real del bucket en su CP.
//   - Todo lo demás (estado, banderas rojas, m², ascensor, ático, histórico
//     de rebajas) NO entra en el score. Aparece como "tags" — etiquetas
//     binarias verificables que el inversor lee y pondera por sí mismo.
//   - No inventamos pesos compuestos. Si no hay mediana, no hay score.
//
// El cálculo del score es publicable: ver `buildReason()` para la fórmula
// exacta que se aplicó a la propiedad.

export interface PropertyFactsInput {
  /** €/m² real de la propiedad. */
  pricePerM2: number | null;
  /** Mediana €/m² del CP+bucket (subasta/bank-owned/portal). Verificable. */
  bucketMedianEurM2: number | null;
  /** Nº muestras del CP+bucket — para mostrar al usuario. */
  bucketSampleSize: number;
  /** Etiquetas de origen / estado / características — todas factuales. */
  isAuction: boolean;
  isBankOwned: boolean;
  condition: string | null;
  redFlags: string[];
  m2: number | null;
  rooms: number | null;
  hasTerrace: boolean | null;
  hasElevator: boolean | null;
  floor: string | null;
  yearBuilt: number | null;
  hiddenPrice: boolean;
  /** Histórico observado por Lince (NO es histórico real del portal). */
  dropCount: number;
  dropTotalPct: number;
  daysObservedByLince: number;
  daysSinceLastDrop: number | null;
}

export type TagTone = 'positive' | 'negative' | 'neutral' | 'info';

export interface FactTag {
  /** ID estable para tests y render. */
  id: string;
  /** Texto humano corto. */
  label: string;
  tone: TagTone;
  /** Explicación literal de dónde sale el dato — para tooltip / inspección. */
  source: string;
}

export interface OpportunityFacts {
  /**
   * Score 0-100 derivado SOLO del descuento vs mediana del bucket.
   * Lineal: 50 = al precio de mercado, 100 = 50%+ por debajo, 0 = 50%+ por
   * encima. Null si no hay mediana con muestra suficiente.
   */
  discountScore: number | null;
  /**
   * Descuento numérico real. -0.51 = 51% bajo mediana. Null si sin mediana.
   * Esta es la cifra "honesta" que se muestra al usuario; el score deriva de
   * aquí, no al revés.
   */
  discountVsBucketPct: number | null;
  /** Cifras crudas que se pueden enseñar al inversor, todas verificables. */
  facts: {
    pricePerM2: number | null;
    bucketMedianEurM2: number | null;
    bucketSampleSize: number;
  };
  /** Etiquetas binarias factuales. No suman al score. */
  tags: FactTag[];
  /**
   * Razón humana del score. Frase única que cita explícitamente los números
   * y el cálculo. Si no hay score, explica por qué.
   */
  reason: string;
  /** Caveats: limitaciones de las que el usuario debe ser consciente. */
  caveats: string[];
}

/** Mínimo de muestra del bucket para considerar la mediana fiable. */
const MIN_BUCKET_SAMPLE = 3;

/**
 * Calcula el score (= descuento vs mediana del bucket) y compone las tags
 * factuales. NO mezcla heurísticas. NO inventa pesos.
 */
export function computeOpportunityFacts(input: PropertyFactsInput): OpportunityFacts {
  const tags = buildTags(input);
  const caveats = buildCaveats(input);

  // Score = descuento vs mediana del bucket. Caso "no calculable":
  if (
    input.pricePerM2 === null ||
    input.bucketMedianEurM2 === null ||
    input.bucketMedianEurM2 <= 0 ||
    input.bucketSampleSize < MIN_BUCKET_SAMPLE
  ) {
    return {
      discountScore: null,
      discountVsBucketPct: null,
      facts: {
        pricePerM2: input.pricePerM2,
        bucketMedianEurM2: input.bucketMedianEurM2,
        bucketSampleSize: input.bucketSampleSize,
      },
      tags,
      reason: buildNoScoreReason(input),
      caveats,
    };
  }

  const delta = (input.bucketMedianEurM2 - input.pricePerM2) / input.bucketMedianEurM2;

  // Conversión lineal: delta=0 → 50, delta=+0.50 → 100, delta=-0.50 → 0.
  // Por qué 0.50: un piso al 50% bajo la mediana del bucket es excepcional;
  // saturar ahí evita que un outlier ridículo "rompa" el ranking.
  const raw = 50 + delta * 100;
  const score = clamp(Math.round(raw), 0, 100);

  return {
    discountScore: score,
    discountVsBucketPct: delta,
    facts: {
      pricePerM2: input.pricePerM2,
      bucketMedianEurM2: input.bucketMedianEurM2,
      bucketSampleSize: input.bucketSampleSize,
    },
    tags,
    reason: buildReason(input, delta, score),
    caveats,
  };
}

// ============================================================================
// Razonamiento humano
// ============================================================================

function buildReason(input: PropertyFactsInput, delta: number, score: number): string {
  const bucket = input.isAuction ? 'subasta' : input.isBankOwned ? 'bank-owned' : 'portal';
  const sign = delta >= 0 ? 'por debajo' : 'por encima';
  const pct = Math.round(Math.abs(delta * 100));
  const price = Math.round(input.pricePerM2 as number);
  const median = Math.round(input.bucketMedianEurM2 as number);
  return (
    `Score ${score}/100: ${price}€/m² vs mediana ${median}€/m² del CP en bucket ${bucket} ` +
    `(${input.bucketSampleSize} muestras) — ${pct}% ${sign} de la mediana.`
  );
}

function buildNoScoreReason(input: PropertyFactsInput): string {
  if (input.pricePerM2 === null) return 'Sin score: precio o m² no disponibles en la fuente.';
  if (input.bucketMedianEurM2 === null) {
    return `Sin score: no hay mediana real para el bucket de esta propiedad (${input.bucketSampleSize} muestras).`;
  }
  return `Sin score: el bucket tiene solo ${input.bucketSampleSize} muestras (mínimo ${MIN_BUCKET_SAMPLE}).`;
}

// ============================================================================
// Tags factuales — todas verificables contra el dato de la fila
// ============================================================================

function buildTags(input: PropertyFactsInput): FactTag[] {
  const tags: FactTag[] = [];

  // Origen / bucket
  if (input.isAuction) {
    tags.push({
      id: 'auction',
      label: 'Subasta judicial',
      tone: 'info',
      source: 'is_auction=true en DB (origen BOE)',
    });
  } else if (input.isBankOwned) {
    tags.push({
      id: 'bank_owned',
      label: 'Bank-owned',
      tone: 'info',
      source: 'is_bank_owned=true en DB (Solvia / banco)',
    });
  }

  // Condición textual
  if (input.condition === 'needs_reform') {
    tags.push({
      id: 'needs_reform',
      label: 'A reformar',
      tone: 'neutral',
      source: 'condition=needs_reform (detectado en texto del anuncio)',
    });
  } else if (input.condition === 'new') {
    tags.push({
      id: 'new_build',
      label: 'Obra nueva',
      tone: 'info',
      source: 'condition=new (detectado en texto del anuncio)',
    });
  } else if (input.condition === 'recently_reformed') {
    tags.push({
      id: 'recently_reformed',
      label: 'Recién reformado',
      tone: 'info',
      source: 'condition=recently_reformed (detectado en texto del anuncio)',
    });
  }

  // Banderas rojas — verificables contra red_flags[]
  for (const flag of input.redFlags) {
    const label = RED_FLAG_LABELS[flag] ?? flag;
    tags.push({
      id: `flag_${flag}`,
      label,
      tone: 'negative',
      source: `red_flags contiene "${flag}" (regex sobre descripción)`,
    });
  }

  // Características físicas
  if (input.m2 !== null && input.m2 >= 100) {
    tags.push({
      id: 'big',
      label: `Grande (${input.m2}m²)`,
      tone: 'positive',
      source: `m2=${input.m2} de la fuente`,
    });
  }

  if (input.hasTerrace === true) {
    tags.push({
      id: 'terrace',
      label: 'Con terraza',
      tone: 'positive',
      source: 'has_terrace=true en DB',
    });
  }

  const looksLikeAtico = input.floor !== null && /(ático|atico|ultima|último)/i.test(input.floor);
  if (looksLikeAtico) {
    tags.push({
      id: 'attic',
      label: 'Ático',
      tone: 'positive',
      source: `floor="${input.floor}" en DB`,
    });
  }

  // Ascensor en finca antigua — solo si AMBOS datos están presentes
  if (input.hasElevator === true && input.yearBuilt !== null && input.yearBuilt < 1980) {
    tags.push({
      id: 'elevator_in_old_building',
      label: `Ascensor en finca ${input.yearBuilt}`,
      tone: 'positive',
      source: `has_elevator=true AND year_built=${input.yearBuilt}`,
    });
  }

  if (input.hiddenPrice) {
    tags.push({
      id: 'hidden_price',
      label: 'Precio no público',
      tone: 'negative',
      source: 'flag mostrarPrecio=N en datos de Solvia',
    });
  }

  // Histórico de rebajas observado por Lince — solo si hubo movimiento real
  if (input.dropCount > 0) {
    const pct = Math.round(Math.abs(input.dropTotalPct));
    const recency =
      input.daysSinceLastDrop !== null && input.daysSinceLastDrop < 30
        ? `, última hace ${input.daysSinceLastDrop}d`
        : '';
    tags.push({
      id: 'observed_drops',
      label: `${input.dropCount} rebaja${input.dropCount > 1 ? 's' : ''} −${pct}%${recency}`,
      tone: 'positive',
      source: `${input.dropCount} filas en price_history con old_price IS NOT NULL`,
    });
  }

  // Días observado — siempre se muestra (es contexto, no señal)
  tags.push({
    id: 'days_observed',
    label: `Observado hace ${input.daysObservedByLince}d`,
    tone: 'neutral',
    source: `(NOW − first_seen) — NO refleja tiempo en mercado real del portal`,
  });

  return tags;
}

// ============================================================================
// Caveats — limitaciones que el inversor debe conocer
// ============================================================================

function buildCaveats(input: PropertyFactsInput): string[] {
  const caveats: string[] = [];

  // Tiempo real en mercado: siempre es un caveat porque first_seen es la
  // fecha en que Lince vio la propiedad, no la fecha de publicación.
  if (input.daysObservedByLince < 14) {
    caveats.push(
      'Días observados ≠ días reales en mercado. Lince vio esta propiedad por primera vez ' +
        `hace ${input.daysObservedByLince} día${input.daysObservedByLince === 1 ? '' : 's'}, pero podría llevar publicada mucho más tiempo.`,
    );
  }

  // Histórico de rebajas parcial: si dropCount=0 y daysObservedByLince es bajo
  if (input.dropCount === 0 && input.daysObservedByLince < 30) {
    caveats.push(
      'Sin rebajas en histórico de Lince — pero podría haber bajado precio antes de que la viéramos.',
    );
  }

  // Banderas rojas detectadas por regex
  if (input.redFlags.length > 0) {
    caveats.push(
      'Las banderas rojas se detectan con regex sobre el texto del anuncio. Pueden tener falsos positivos / negativos — verifica antes de descartar.',
    );
  }

  return caveats;
}

// ============================================================================
// Constantes
// ============================================================================

const RED_FLAG_LABELS: Record<string, string> = {
  occupied: 'Ocupado / okupa',
  has_tenant: 'Con inquilino',
  vpo: 'VPO',
  has_charges: 'Con cargas',
  no_habitability: 'Sin cédula habitabilidad',
  illegal_construction: 'Sin licencia',
  not_visitable: 'No visitable',
  hidden_price: 'Precio oculto',
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
