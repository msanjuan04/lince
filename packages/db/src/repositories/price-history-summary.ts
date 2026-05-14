// Resumen por propiedad de su histórico de precios. Alimenta el componente
// `motivation` del valuator: cuántas rebajas, magnitud acumulada, días desde
// la última.
//
// Estrategia: una sola query agregada sobre `price_history` y `properties`.
// Se devuelve un Map indexado por propertyId. Las propiedades sin rebajas
// observadas no aparecen en el Map — el caller las trata como motivación
// "recién publicada" (daysOnMarket calculado por separado desde firstSeen).

import { prisma } from '../index';

export interface PriceHistorySummary {
  propertyId: string;
  /** Cuántas filas de history hay con `old_price != null` — = nº rebajas. */
  dropCount: number;
  /** Magnitud acumulada de rebajas (porcentaje negativo, ej. -12 = -12%). */
  dropTotalPct: number;
  /** Días desde la rebaja más reciente. */
  daysSinceLastDrop: number;
  /** Precio inicial observado (cuando first_seen). */
  firstPrice: number | null;
  /** Precio actual (última observación). */
  lastPrice: number;
}

/**
 * Devuelve resumen agregado para todas las propiedades que han tenido al
 * menos una rebaja. Una sola query agregada sobre price_history.
 */
export async function getPriceHistorySummaryMap(): Promise<Map<string, PriceHistorySummary>> {
  const rows = await prisma.$queryRaw<
    Array<{
      property_id: string;
      drop_count: bigint;
      drop_total_pct: number | null;
      last_drop_at: Date;
      first_price: number | null;
      last_price: number;
    }>
  >`
    WITH ranked AS (
      SELECT
        property_id,
        old_price,
        new_price,
        delta_pct,
        observed_at,
        ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY observed_at ASC) AS rn_asc,
        ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY observed_at DESC) AS rn_desc
      FROM price_history
    ),
    drops AS (
      SELECT
        property_id,
        COUNT(*) FILTER (WHERE old_price IS NOT NULL) AS drop_count,
        SUM(delta_pct) FILTER (WHERE old_price IS NOT NULL)::float AS drop_total_pct,
        MAX(observed_at) FILTER (WHERE old_price IS NOT NULL) AS last_drop_at
      FROM price_history
      GROUP BY property_id
    ),
    firsts AS (
      SELECT property_id, new_price::float AS first_price
      FROM ranked
      WHERE rn_asc = 1
    ),
    lasts AS (
      SELECT property_id, new_price::float AS last_price
      FROM ranked
      WHERE rn_desc = 1
    )
    SELECT
      d.property_id,
      d.drop_count,
      d.drop_total_pct,
      d.last_drop_at,
      f.first_price,
      l.last_price
    FROM drops d
    LEFT JOIN firsts f ON f.property_id = d.property_id
    LEFT JOIN lasts l ON l.property_id = d.property_id
    WHERE d.drop_count > 0
  `;

  const map = new Map<string, PriceHistorySummary>();
  const now = Date.now();

  for (const r of rows) {
    const dropCount = Number(r.drop_count);
    if (dropCount === 0) continue;
    const daysSinceLastDrop = Math.max(
      0,
      Math.floor((now - r.last_drop_at.getTime()) / (1000 * 60 * 60 * 24)),
    );
    map.set(r.property_id, {
      propertyId: r.property_id,
      dropCount,
      dropTotalPct: r.drop_total_pct ?? 0,
      daysSinceLastDrop,
      firstPrice: r.first_price,
      lastPrice: r.last_price ?? 0,
    });
  }

  return map;
}
