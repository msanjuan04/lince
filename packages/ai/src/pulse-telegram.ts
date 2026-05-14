// Helper compartido por CLI dispatch + server action de la web.
// Dado un informe (markdown + propiedades + stats de zona), lo envía a un
// chat de Telegram como 1 narrativa larga + 1 álbum visual.

import type { TelegramClient, TelegramSendResult } from '@lince/notifier';
import { markdownToTelegramHtml } from '@lince/notifier';
import type { PulsePropertyInput, PulseZoneStats } from './prompts/pulse-agent';

export interface SendPulseReportInput {
  chatId: string | number;
  markdown: string;
  properties: PulsePropertyInput[];
  zoneStats: PulseZoneStats[];
  /** Máx fotos del álbum visual. Default 5, máx 10 (límite Telegram). */
  maxAlbumSize?: number;
}

export interface SendPulseReportOutcome {
  narrative: TelegramSendResult;
  /** undefined si no había fotos suficientes para mandar álbum. */
  album?: TelegramSendResult;
  albumSize: number;
}

/**
 * Envía un informe Pulse completo a un chat:
 *   1. Mensaje (o varios chunks de 4096 chars) con el markdown → HTML.
 *   2. Álbum opcional con hasta N fotos de las top oportunidades.
 *
 * Si la narrativa falla, no intenta el álbum (devuelve `narrative` con el error).
 * Si la narrativa va y el álbum falla, devuelve ambos para que el caller decida.
 */
export async function sendPulseReportToTelegram(
  client: TelegramClient,
  input: SendPulseReportInput,
): Promise<SendPulseReportOutcome> {
  const html = markdownToTelegramHtml(input.markdown);
  const narrative = await client.sendMessage({
    chatId: input.chatId,
    text: html,
    parseMode: 'HTML',
    disableWebPagePreview: true,
  });

  if (!narrative.ok) {
    return { narrative, albumSize: 0 };
  }

  const album = buildPulseAlbum(input.properties, input.zoneStats, input.maxAlbumSize ?? 5);
  if (album.length === 0) {
    return { narrative, albumSize: 0 };
  }

  const albumResult = await client.sendMediaGroup({
    chatId: input.chatId,
    items: album,
    disableNotification: true,
  });

  return { narrative, album: albumResult, albumSize: album.length };
}

/**
 * Construye el álbum visual: hasta `maxAlbumSize` propiedades del top con foto,
 * cada una con caption HTML (dirección clicable + datos clave + link a la
 * fuente). El primer ítem lleva un título de cabecera; los demás solo datos.
 */
export function buildPulseAlbum(
  properties: PulsePropertyInput[],
  zoneStats: PulseZoneStats[],
  maxAlbumSize = 5,
): Array<{ photoUrl: string; caption: string; parseMode: 'HTML' }> {
  const zoneByCp = new Map(zoneStats.map((z) => [z.postalCode, z]));
  const withPhoto = properties.filter((p) => !!p.mainImageUrl);
  const top = withPhoto.slice(0, maxAlbumSize);

  return top.map((p, idx) => ({
    photoUrl: p.mainImageUrl as string,
    caption: buildPropertyCaption(p, zoneByCp.get(p.postalCode ?? ''), idx + 1, idx === 0),
    parseMode: 'HTML' as const,
  }));
}

function buildPropertyCaption(
  p: PulsePropertyInput,
  zone: PulseZoneStats | undefined,
  position: number,
  isFirst: boolean,
): string {
  const lines: string[] = [];
  if (isFirst) {
    lines.push('<b>Top oportunidades — visual</b>');
    lines.push('');
  }

  const address = escapeHtml(p.address ?? 'Sin dirección');
  const cpCity = [p.postalCode, p.city].filter(Boolean).join(' ');
  const header = p.sourceUrl
    ? `<b>${position}. <a href="${escapeAttr(p.sourceUrl)}">${address}</a></b>`
    : `<b>${position}. ${address}</b>`;
  lines.push(header);
  if (cpCity) lines.push(escapeHtml(cpCity));

  const facts: string[] = [];
  if (p.type) facts.push(escapeHtml(p.type));
  if (p.m2) facts.push(`${p.m2}m²`);
  if (p.rooms) facts.push(`${p.rooms} hab`);
  if (facts.length > 0) lines.push(facts.join(' · '));

  if (p.price != null) {
    const priceLine: string[] = [`<b>${formatEur(p.price)}</b>`];
    if (p.pricePerM2 != null) priceLine.push(`${formatEur(p.pricePerM2)}/m²`);
    if (zone?.avgPricePerM2 && p.pricePerM2 != null) {
      const delta = ((p.pricePerM2 - zone.avgPricePerM2) / zone.avgPricePerM2) * 100;
      const sign = delta < 0 ? '' : '+';
      priceLine.push(`(${sign}${delta.toFixed(0)}% vs zona ${formatEur(zone.avgPricePerM2)}/m²)`);
    }
    lines.push(priceLine.join(' · '));
  }

  if (p.opportunityScore != null) {
    lines.push(`Score: <b>${Math.round(p.opportunityScore)}/100</b>`);
  }

  const tags: string[] = [];
  if (p.isAuction) tags.push('Subasta');
  if (p.isBankOwned) tags.push('Bank-owned');
  if (p.condition === 'needs_reform') tags.push('A reformar');
  if (p.redFlags && p.redFlags.length > 0) {
    tags.push(`⚠️ ${p.redFlags.slice(0, 3).join(', ')}`);
  }
  if (tags.length > 0) lines.push(tags.join(' · '));

  if (p.sourceUrl) {
    lines.push('');
    lines.push(`<a href="${escapeAttr(p.sourceUrl)}">Ver anuncio en ${escapeHtml(p.source)}</a>`);
  }

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatEur(n: number): string {
  const fixed = Math.round(n).toString();
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '€';
}
