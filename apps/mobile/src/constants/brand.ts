// Marca Lince — colores y etiquetas de fuente. Colores fijos (no dependen de
// theme claro/oscuro) para que el acento de marca sea consistente.

export const Brand = {
  /** Verde azulado Lince — primario (botones, acentos, tab activa). */
  primary: '#0E9F8E',
  primaryDark: '#0B7D70',
  /** Verde "ahorro" — badge de descuento vs zona. */
  discount: '#12B76A',
  /** Ámbar "off-market" — deals exclusivos que suben los linces. */
  offMarket: '#F59E0B',
  /** Rojo suave — rebajas / urgencia. */
  danger: '#F04438',
  white: '#FFFFFF',
} as const;

export type DealFeed = 'offmarket' | 'ia';

/** Etiqueta legible de la fuente de un chollo. */
export const SOURCE_LABELS: Record<string, string> = {
  lince: 'Lince',
  pisos: 'Pisos.com',
  boe: 'BOE Subastas',
  solvia: 'Solvia',
  servihabitat: 'Servihabitat',
  aliseda: 'Aliseda',
  altamira: 'Altamira',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Formatea € sin decimales (es-ES). */
export function formatEur(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}
