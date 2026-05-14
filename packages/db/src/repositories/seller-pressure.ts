// Score "vendedor bajo presión" agregado por (source, postalCode). Este es un
// proxy: usamos `source` como identificador de "agencia" hasta que el crawler
// extraiga el nombre real de la inmobiliaria que publica.
//
// La señal: cuántas propiedades tiene esa fuente en ese CP que están "atascadas"
// (>60 días en mercado, o han bajado precio). Un score alto = el vendedor cede
// fácil porque tiene mucho stock muerto. Un score bajo = vendedor sin presión.

import { prisma } from '../index';

export interface SellerPressureKey {
  source: string;
  postalCode: string;
}

export interface SellerPressureStats {
  source: string;
  postalCode: string;
  totalListings: number;
  /** Propiedades >60d sin rebaja, o con cualquier rebaja. */
  stuckListings: number;
  /** Días en mercado promedio. */
  avgDaysOnMarket: number;
  /** % de propiedades de esta agencia/CP que han bajado precio alguna vez. */
  pctWithDrops: number;
  /** 0-100. Alto = presión alta sobre el vendedor. */
  score: number;
}

const STUCK_THRESHOLD_DAYS = 60;

/**
 * Devuelve un map indexado por `"<source>|<postalCode>"` con la presión
 * estimada del vendedor en ese contexto. Una sola query agregada.
 */
export async function getSellerPressureMap(): Promise<Map<string, SellerPressureStats>> {
  const rows = await prisma.$queryRaw<
    Array<{
      source: string;
      postal_code: string;
      total: bigint;
      stuck: bigint;
      with_drops: bigint;
      avg_days: number | null;
    }>
  >`
    WITH props AS (
      SELECT
        p.id,
        p.source,
        p.postal_code,
        EXTRACT(DAY FROM (NOW() - p.first_seen))::int AS days_on_market,
        EXISTS (
          SELECT 1 FROM price_history ph
          WHERE ph.property_id = p.id AND ph.old_price IS NOT NULL
        ) AS has_drop
      FROM properties p
      WHERE p.postal_code IS NOT NULL
        AND p.price IS NOT NULL
    )
    SELECT
      source,
      postal_code,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (
        WHERE days_on_market > ${STUCK_THRESHOLD_DAYS} OR has_drop
      )::bigint AS stuck,
      COUNT(*) FILTER (WHERE has_drop)::bigint AS with_drops,
      AVG(days_on_market)::float AS avg_days
    FROM props
    GROUP BY source, postal_code
  `;

  const map = new Map<string, SellerPressureStats>();
  for (const r of rows) {
    const total = Number(r.total);
    const stuck = Number(r.stuck);
    const withDrops = Number(r.with_drops);
    const avgDays = r.avg_days ?? 0;

    // Score: % atascado pesa 60%, % con rebajas pesa 30%, días promedio 10%.
    const stuckPct = total > 0 ? stuck / total : 0;
    const dropsPct = total > 0 ? withDrops / total : 0;
    const daysScore = Math.min(1, avgDays / 180); // 180+ días → 1.0

    const score = Math.round((stuckPct * 60 + dropsPct * 30 + daysScore * 10) * 100) / 1; // already 0-100

    const key = `${r.source}|${r.postal_code}`;
    map.set(key, {
      source: r.source,
      postalCode: r.postal_code,
      totalListings: total,
      stuckListings: stuck,
      avgDaysOnMarket: Math.round(avgDays),
      pctWithDrops: Math.round(dropsPct * 100),
      score: Math.max(0, Math.min(100, Math.round(score))),
    });
  }

  return map;
}

export function pressureKey(source: string, postalCode: string | null): string | null {
  if (!postalCode) return null;
  return `${source}|${postalCode}`;
}
