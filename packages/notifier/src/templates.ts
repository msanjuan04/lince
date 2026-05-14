// Plantillas de mensaje por trigger. Texto plano para WhatsApp y HTML
// minimalista para Telegram. Cuando tengamos plantillas pre-aprobadas por Meta,
// renderWhatsAppMessage elegirá entre texto y template structured.

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Render HTML para Telegram (parse_mode='HTML'). Las URLs van en anchors para
 * que el cliente las renderice clicables. El resto del texto se escapa.
 *
 * Diseñado para una alerta puntual de zona, no para el informe Pulse completo
 * (eso lo hace pulse-telegram.ts con su album y formato propio).
 */
export function renderTelegramAlert(trigger: AlertTrigger, ctx: AlertContext): string {
  const { property: p } = ctx;
  const addr = escapeHtml(p.address ?? 'Inmueble sin dirección expuesta');
  const where = escapeHtml([p.city, p.postalCode].filter(Boolean).join(' · '));
  const size = p.m2 != null ? `${p.m2} m²` : null;
  const rooms = p.rooms != null && p.rooms > 0 ? `${p.rooms} hab` : null;
  const meta = [size, rooms].filter(Boolean).join(' · ');
  const zoneName = escapeHtml(ctx.zoneName);

  const lines: string[] = [];

  switch (trigger) {
    case 'new_property':
      lines.push(`🆕 <b>Nueva oportunidad en ${zoneName}</b>`);
      break;
    case 'price_drop': {
      const dropPct = ctx.priceDropPct != null ? Math.abs(ctx.priceDropPct).toFixed(1) : '?';
      lines.push(`📉 <b>Rebaja del ${dropPct}% en ${zoneName}</b>`);
      break;
    }
    case 'high_score':
      lines.push(`⭐ <b>Oportunidad fuerte en ${zoneName}</b>`);
      break;
  }

  lines.push('');
  // Anchor sobre la dirección si tenemos URL, así un solo tap abre el anuncio.
  if (p.sourceUrl) {
    lines.push(`<a href="${escapeAttr(p.sourceUrl)}">${addr}</a>`);
  } else {
    lines.push(addr);
  }
  if (where) lines.push(where);
  if (meta) lines.push(escapeHtml(meta));

  lines.push('');
  lines.push(`<b>${formatEur(p.price)}</b>`);
  if (p.pricePerM2 != null) {
    let zoneInfo = '';
    if (p.zoneAvgPricePerM2 != null && p.zoneAvgPricePerM2 > 0) {
      const delta = ((p.zoneAvgPricePerM2 - p.pricePerM2) / p.zoneAvgPricePerM2) * 100;
      const sign = delta >= 0 ? '−' : '+';
      zoneInfo = ` (${sign}${Math.abs(Math.round(delta))}% vs zona)`;
    }
    lines.push(`${formatEur(p.pricePerM2)}/m²${zoneInfo}`);
  }
  if (trigger === 'high_score' && ctx.score != null) {
    lines.push(`Score: <b>${ctx.score}/100</b>`);
  }

  lines.push('');
  lines.push(`<i>Fuente: ${escapeHtml(p.sourceLabel)}</i>`);

  return lines.join('\n');
}
