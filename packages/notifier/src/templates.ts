// Plantillas de mensaje por trigger. Por ahora texto plano (válido para
// WhatsApp test number y para ventanas de 24h). Cuando tengamos plantillas
// pre-aprobadas por Meta, este archivo elige entre texto y template structured.

export type AlertTrigger = 'new_property' | 'price_drop' | 'high_score';

export interface AlertContext {
  zoneName: string;
  property: {
    address: string | null;
    city: string | null;
    postalCode: string | null;
    price: number | null;
    pricePerM2: number | null;
    zoneAvgPricePerM2: number | null;
    m2: number | null;
    rooms: number | null;
    sourceLabel: string;
    sourceUrl: string | null;
  };
  /** Solo para price_drop: el delta % observado. */
  priceDropPct?: number;
  /** Solo para high_score: el score. */
  score?: number;
}

function formatEur(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function renderWhatsAppMessage(trigger: AlertTrigger, ctx: AlertContext): string {
  const { property: p } = ctx;
  const addr = p.address ?? 'Inmueble sin dirección expuesta';
  const where = [p.city, p.postalCode].filter(Boolean).join(' · ');
  const size = p.m2 != null ? `${p.m2} m²` : null;
  const rooms = p.rooms != null && p.rooms > 0 ? `${p.rooms} hab` : null;
  const meta = [size, rooms].filter(Boolean).join(' · ');

  const lines: string[] = [];
  switch (trigger) {
    case 'new_property':
      lines.push(`🆕 Nueva oportunidad en ${ctx.zoneName}`);
      break;
    case 'price_drop': {
      const dropPct = ctx.priceDropPct != null ? Math.abs(ctx.priceDropPct).toFixed(1) : '?';
      lines.push(`📉 Rebaja del ${dropPct}% en ${ctx.zoneName}`);
      break;
    }
    case 'high_score':
      lines.push(`⭐ Oportunidad fuerte en ${ctx.zoneName}`);
      break;
  }
  lines.push('');
  lines.push(addr);
  if (where) lines.push(where);
  if (meta) lines.push(meta);
  lines.push('');
  lines.push(`Precio: ${formatEur(p.price)}`);
  if (p.pricePerM2 != null) {
    let zoneInfo = '';
    if (p.zoneAvgPricePerM2 != null && p.zoneAvgPricePerM2 > 0) {
      const delta = ((p.zoneAvgPricePerM2 - p.pricePerM2) / p.zoneAvgPricePerM2) * 100;
      const sign = delta >= 0 ? '−' : '+';
      zoneInfo = ` (${sign}${Math.abs(Math.round(delta))}% vs zona)`;
    }
    lines.push(`€/m²: ${formatEur(p.pricePerM2)}${zoneInfo}`);
  }
  if (trigger === 'high_score' && ctx.score != null) {
    lines.push(`Score: ${ctx.score}/100`);
  }
  lines.push('');
  lines.push(`Fuente: ${p.sourceLabel}`);
  if (p.sourceUrl) {
    lines.push(p.sourceUrl);
  }
  lines.push('');
  lines.push('— Lince Pulse');
  return lines.join('\n');
}
