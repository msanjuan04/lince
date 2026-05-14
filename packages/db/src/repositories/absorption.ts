// Mediana de tiempo de absorción por CP+bucket — proxy de "cuánto tarda en
// salir del mercado" tras publicarse. Lo medimos a partir de propiedades que
// el crawler ha dejado de ver (disappearedAt != null).
//
// Útil para:
//   - El componente `monthsToSell` del flip estimate (clave para anualizar)
//   - Heatmap de liquidez por zona
//
// Caveat honesto: "desaparecida del crawler" != "vendida". Puede ser retirada,
// puesta off-market, o cambio de URL. Lo asumimos como proxy razonable hasta
// que tengamos datos de transacciones reales (notariado, registro).

import { prisma } from '../index';

export type Bucket = 'auction' | 'bank_owned' | 'portal';

export interface AbsorptionStat {
  postalCode: string;
  bucket: Bucket;
  /** Mediana de días entre first_seen y disappeared_at. */
  medianDays: number;
  /** Número de propiedades en la muestra (que han desaparecido). */
  sampleSize: number;
}

/** Mínimo de muestra para considerar la mediana fiable. */
const MIN_SAMPLE = 3;

/**
 * Mediana de absorción agregada por (CP, bucket). Solo CPs+buckets con al menos
 * MIN_SAMPLE propiedades desaparecidas. Devuelve un Map indexado por
 * `"<postalCode>|<bucket>"` para lookup O(1).
 */
export async function getAbsorptionMap(): Promise<Map<string, AbsorptionStat>> {
  const rows = await prisma.$queryRaw<
    Array<{
      postal_code: string;
      bucket: Bucket;
      median_days: number;
      sample_size: bigint;
    }>
  >`
    SELECT
      postal_code,
      CASE
        WHEN COALESCE(is_auction, false) THEN 'auction'::text
        WHEN COALESCE(is_bank_owned, false) THEN 'bank_owned'::text
        ELSE 'portal'::text
      END AS bucket,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_on_market_observed)::float AS median_days,
      COUNT(*)::bigint AS sample_size
    FROM properties
    WHERE postal_code IS NOT NULL
      AND days_on_market_observed IS NOT NULL
      AND days_on_market_observed > 0
    GROUP BY postal_code,
             CASE
               WHEN COALESCE(is_auction, false) THEN 'auction'::text
               WHEN COALESCE(is_bank_owned, false) THEN 'bank_owned'::text
               ELSE 'portal'::text
             END
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `;

  const map = new Map<string, AbsorptionStat>();
  for (const r of rows) {
    map.set(`${r.postal_code}|${r.bucket}`, {
      postalCode: r.postal_code,
      bucket: r.bucket,
      medianDays: Math.round(r.median_days),
      sampleSize: Number(r.sample_size),
    });
  }
  return map;
}

export function absorptionKey(postalCode: string, bucket: Bucket): string {
  return `${postalCode}|${bucket}`;
}
