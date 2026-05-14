// Estadísticas por CP — medianas reales (PERCENTILE_CONT) y bandas por bucket.
// El uso típico:
//   - Una vez por fetch, llamas `getZoneStatsMap()` y obtienes un Map indexado
//     por CP con la mediana global del CP + las medianas por bucket.
//   - El valuator usa la mediana del BUCKET al que pertenece la propiedad
//     (subastas comparan con subastas), con fallback a la global del CP.

import { prisma } from '../index';

export type Bucket = 'auction' | 'bank_owned' | 'portal';

export interface BucketStats {
  /** Mediana €/m² del CP+bucket. `null` si no hay muestra. */
  medianEurM2: number | null;
  /** Nº propiedades en el CP+bucket. */
  count: number;
}

export interface ZoneStats {
  postalCode: string;
  city: string | null;
  province: string | null;
  /** Mediana €/m² de todo el CP (excluyendo subastas — sesgan a la baja). */
  medianEurM2: number | null;
  /** Nº propiedades del CP global (con price_per_m2). */
  totalCount: number;
  /** Medianas por bucket. */
  buckets: Record<Bucket, BucketStats>;
  /** 0-100: actividad de la zona (volumen + diversidad de buckets). */
  liquidityScore: number;
}

/** Mínimo de muestra para considerar una mediana fiable. */
const MIN_SAMPLE = 3;

/** Filtro €/m² para excluir outliers/inputs corruptos. */
const SANE_MIN_EUR_M2 = 500;
const SANE_MAX_EUR_M2 = 20_000;

/**
 * Calcula medianas reales por CP y por CP+bucket. Una sola query agregada.
 * Devuelve un Map indexado por CP. CPs con <MIN_SAMPLE propiedades quedan
 * fuera (los devolveríamos pero sin mediana, que confunde más que ayuda).
 */
export async function getZoneStatsMap(): Promise<Map<string, ZoneStats>> {
  const rows = await prisma.$queryRaw<
    Array<{
      postal_code: string;
      city: string | null;
      province: string | null;
      bucket: Bucket;
      median_eur_m2: number | null;
      count: bigint;
    }>
  >`
    SELECT
      postal_code,
      MAX(city) AS city,
      MAX(province) AS province,
      CASE
        WHEN COALESCE(is_auction, false) THEN 'auction'::text
        WHEN COALESCE(is_bank_owned, false) THEN 'bank_owned'::text
        ELSE 'portal'::text
      END AS bucket,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_m2)::float AS median_eur_m2,
      COUNT(*)::bigint AS count
    FROM properties
    WHERE postal_code IS NOT NULL
      AND price_per_m2 IS NOT NULL
      AND price_per_m2 BETWEEN ${SANE_MIN_EUR_M2} AND ${SANE_MAX_EUR_M2}
    GROUP BY postal_code,
             CASE
               WHEN COALESCE(is_auction, false) THEN 'auction'::text
               WHEN COALESCE(is_bank_owned, false) THEN 'bank_owned'::text
               ELSE 'portal'::text
             END
  `;

  const byCp = new Map<string, ZoneStats>();
  for (const r of rows) {
    let entry = byCp.get(r.postal_code);
    if (!entry) {
      entry = {
        postalCode: r.postal_code,
        city: r.city,
        province: r.province,
        medianEurM2: null,
        totalCount: 0,
        buckets: {
          auction: { medianEurM2: null, count: 0 },
          bank_owned: { medianEurM2: null, count: 0 },
          portal: { medianEurM2: null, count: 0 },
        },
        liquidityScore: 0,
      };
      byCp.set(r.postal_code, entry);
    }
    const count = Number(r.count);
    const median =
      r.median_eur_m2 !== null && count >= MIN_SAMPLE ? Math.round(r.median_eur_m2) : null;
    entry.buckets[r.bucket] = { medianEurM2: median, count };
    entry.totalCount += count;
  }

  // Segunda pasada: mediana global del CP (excluyendo subastas — son outliers a
  // la baja, comparar precio retail con subasta no tiene sentido).
  // Para no hacer otra query, aproximamos como media ponderada por count de las
  // medianas de bank_owned + portal. No es matemáticamente exacto pero es muy
  // razonable y barato.
  for (const entry of byCp.values()) {
    const nonAuction: Array<{ median: number; count: number }> = [];
    if (entry.buckets.bank_owned.medianEurM2 !== null) {
      nonAuction.push({
        median: entry.buckets.bank_owned.medianEurM2,
        count: entry.buckets.bank_owned.count,
      });
    }
    if (entry.buckets.portal.medianEurM2 !== null) {
      nonAuction.push({
        median: entry.buckets.portal.medianEurM2,
        count: entry.buckets.portal.count,
      });
    }
    const totalNonAuctionCount = nonAuction.reduce((s, x) => s + x.count, 0);
    if (totalNonAuctionCount >= MIN_SAMPLE) {
      const weighted = nonAuction.reduce((s, x) => s + x.median * x.count, 0);
      entry.medianEurM2 = Math.round(weighted / totalNonAuctionCount);
    }
    entry.liquidityScore = computeLiquidityScore(entry);
  }

  return byCp;
}

/**
 * Liquidez de zona 0-100 basada en:
 *  - Volumen total (más propiedades en el CP = más actividad)
 *  - Diversidad de buckets (si hay portal + bank + subasta = mercado vivo)
 *
 * Calibración aproximada para Catalunya:
 *   - 1-2 props: 10-20
 *   - 5 props: 40
 *   - 10 props: 60
 *   - 20+ props: 80-100
 *   - Diversidad: +5 por cada bucket adicional con muestra
 */
function computeLiquidityScore(stats: ZoneStats): number {
  const volume = Math.min(80, Math.sqrt(stats.totalCount) * 22);
  const diversity =
    (stats.buckets.auction.count > 0 ? 7 : 0) +
    (stats.buckets.bank_owned.count > 0 ? 7 : 0) +
    (stats.buckets.portal.count > 0 ? 6 : 0);
  return Math.max(0, Math.min(100, Math.round(volume + diversity)));
}

/** Helper para clasificar una propiedad en su bucket. */
export function bucketOf(p: { isAuction?: boolean | null; isBankOwned?: boolean | null }): Bucket {
  if (p.isAuction) return 'auction';
  if (p.isBankOwned) return 'bank_owned';
  return 'portal';
}
