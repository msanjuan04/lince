const eurosFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const eurosCompactFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  maximumFractionDigits: 0,
});

const relativeDateFormatter = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

export function formatEuros(value: number): string {
  return eurosFormatter.format(value);
}

export function formatEurosCompact(value: number): string {
  return eurosCompactFormatter.format(value);
}

export function formatPricePerM2(value: number): string {
  return `${eurosFormatter.format(value)}/m²`;
}

export function formatM2(value: number): string {
  return `${numberFormatter.format(value)} m²`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatScore(value: number): string {
  return Math.round(value).toString();
}

export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHour = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffMin) < 60) return relativeDateFormatter.format(diffMin, 'minute');
  if (Math.abs(diffHour) < 24) return relativeDateFormatter.format(diffHour, 'hour');
  if (Math.abs(diffDay) < 7) return relativeDateFormatter.format(diffDay, 'day');
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date);
}

export function formatDiscountPct(price: number, marketPrice: number): string {
  if (marketPrice === 0) return '—';
  return percentFormatter.format((price - marketPrice) / marketPrice);
}

/**
 * Formato display de móvil español: "623 808 712" (sin prefijo +34, asumimos
 * España peninsular). Para móviles no-españoles, devuelve con '+' como respaldo.
 */
export function formatPhoneEs(e164: string | null | undefined): string {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('34') && digits.length === 11) {
    return `${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  // No es ES → mantenemos prefijo internacional con '+'
  return `+${digits}`;
}
