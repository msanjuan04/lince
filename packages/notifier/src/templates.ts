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
    /** Foto principal — si está, evaluate-zones la usa para sendPhoto. */
    mainImageUrl?: string | null;
    /** Precio antes de la última rebaja (Aliseda: PrecioAnterior). */
    previousPrice?: number | null;
    /** Porcentaje de descuento aplicado por la fuente (Aliseda: DescuentoPrecio). */
    discountPct?: number | null;
  };
  /** Solo para price_drop: el delta % observado. */
  priceDropPct?: number;
  /** Solo para high_score: el score. */
  score?: number;
  /** Estimación flip — margen bruto % sobre inversión total. Solo se muestra si se calcula. */
  flipMarginPct?: number | null;
  /** Estimación flip — margen bruto € absoluto. */
  flipMarginEur?: number | null;
  /** Días en mercado — de la fuente si está disponible, o desde firstSeen de Lince. */
  daysOnMarket?: number | null;
  /** Etiqueta de origen del campo daysOnMarket: "fuente" (real) vs "lince" (proxy). */
  daysOnMarketSource?: 'source' | 'lince' | null;
  /** Histórico de rebajas observado por Lince. */
  priceDrops?: {
    count: number;
    totalPct: number;
    daysSinceLast: number | null;
    /** True si la rebaja se registró al ingestar la propiedad (la fuente la
     * traía con `precioAntes`/`PrecioAnterior`). NO conocemos la fecha exacta
     * del cambio — solo que la fuente ya tenía constancia. */
    fromSource?: boolean;
  } | null;
}

function formatEur(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Días → string corto humano. Ej: 5d, 3 sem, 4 m, 1 año. */
function formatDays(days: number): string {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)} sem`;
  if (days < 365) return `${Math.round(days / 30)} m`;
  const years = (days / 365).toFixed(1);
  return `${years} años`;
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
  // Precio con descuento si lo hay — señal de motivación del vendedor.
  if (p.previousPrice != null && p.previousPrice > (p.price ?? 0)) {
    const discountAmount = p.previousPrice - (p.price ?? 0);
    const discountPctReal = p.discountPct ?? Math.round((discountAmount / p.previousPrice) * 100);
    lines.push(
      `<b>${formatEur(p.price)}</b>  <s>${formatEur(p.previousPrice)}</s>  📉 −${discountPctReal}%`,
    );
  } else {
    lines.push(`<b>${formatEur(p.price)}</b>`);
  }

  if (p.pricePerM2 != null) {
    let zoneInfo = '';
    if (p.zoneAvgPricePerM2 != null && p.zoneAvgPricePerM2 > 0) {
      const delta = ((p.zoneAvgPricePerM2 - p.pricePerM2) / p.zoneAvgPricePerM2) * 100;
      const sign = delta >= 0 ? '−' : '+';
      zoneInfo = ` (${sign}${Math.abs(Math.round(delta))}% vs zona)`;
    }
    lines.push(`${formatEur(p.pricePerM2)}/m²${zoneInfo}`);
  }

  // Margen flip estimado — la cifra clave para decidir si vale la pena visitar.
  if (ctx.flipMarginPct != null && ctx.flipMarginEur != null) {
    const pctStr = (ctx.flipMarginPct * 100).toFixed(0);
    const eurStr = formatEur(ctx.flipMarginEur);
    const emoji = ctx.flipMarginPct >= 0.4 ? '🔥' : ctx.flipMarginPct >= 0.25 ? '✅' : '⚠️';
    lines.push(`${emoji} <b>Margen flip estimado: ${pctStr}%</b> (${eurStr})`);
  }

  // Antigüedad + histórico de rebajas — señales de motivación del vendedor.
  // Una propiedad "muchos días + varias rebajas" = vendedor cansado, ofertable.
  const ageBits: string[] = [];
  if (ctx.daysOnMarket != null && ctx.daysOnMarket >= 0) {
    const label = ctx.daysOnMarketSource === 'source' ? 'Publicado' : 'Visto por Lince';
    ageBits.push(`📅 ${label} hace ${formatDays(ctx.daysOnMarket)}`);
  }
  if (ctx.priceDrops && ctx.priceDrops.count > 0) {
    const totalAbs = Math.round(Math.abs(ctx.priceDrops.totalPct));
    const word = ctx.priceDrops.count === 1 ? 'rebaja' : 'rebajas';
    let recency = '';
    if (ctx.priceDrops.fromSource) {
      // Fecha exacta desconocida — la trae la fuente desde antes del primer
      // crawl. No inventamos "hace Xd".
      recency = ' (registrada por la fuente)';
    } else if (ctx.priceDrops.daysSinceLast != null && ctx.priceDrops.daysSinceLast >= 1) {
      recency = ` (última hace ${formatDays(ctx.priceDrops.daysSinceLast)})`;
    }
    ageBits.push(`📉 ${ctx.priceDrops.count} ${word} −${totalAbs}%${recency}`);
  }
  if (ageBits.length > 0) {
    lines.push(ageBits.join(' · '));
  }

  if (trigger === 'high_score' && ctx.score != null) {
    lines.push(`Score: <b>${ctx.score}/100</b>`);
  }

  lines.push('');
  lines.push(`<i>Fuente: ${escapeHtml(p.sourceLabel)}</i>`);

  return lines.join('\n');
}
