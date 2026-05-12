// Pisos.com — portal mainstream. HTML estático, sin WAF para nuestro UA.
// Estructura URL listado: /venta/pisos-<ciudad>_capital/<filtros>/<página>.
// Estructura URL ficha: /comprar/piso-<slug>-<id1>_<id2>/.

import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import {
  fetchText,
  RateLimiter,
  cleanWhitespace,
  detectCondition,
  detectElevator,
  detectOrientation,
  detectRedFlags,
  detectTerrace,
  hashDescription,
  parseFloor,
  parsePriceEur,
  parseRooms,
  parseBathrooms,
  parseSquareMeters,
  parseYear,
  pricePerM2,
  provinceFromPostalCode,
} from '@lince/crawlers-core';
import type { PropertyUpsertInput } from '@lince/db';
import type {
  CrawlerSource,
  CrawlOptions,
  CrawlOutcome,
  CrawlErrorRecord,
  Logger,
} from './types.js';

const PISOS_BASE = 'https://www.pisos.com';
const LIST_URL = `${PISOS_BASE}/venta/pisos-barcelona_capital/`;
const DETAIL_HREF_RE =
  /^\/comprar\/(?:piso|casa|atico|chalet|local|estudio|apartamento)-([a-z0-9_-]+)\/?$/i;
const ID_RE = /-(\d+)_(\d+)\/?$/;
const MAX_PAGES = 8;

export class PisosSource implements CrawlerSource {
  readonly name = 'pisos';
  private readonly limiter = new RateLimiter({ minIntervalMs: 3500 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    const cap = opts.maxItems ?? 150;
    const detailHrefs = new Set<string>();

    // Paginate listado hasta llenar el cap o agotar páginas
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (detailHrefs.size >= cap) break;
      const url = page === 1 ? LIST_URL : `${LIST_URL}${page}/`;
      try {
        const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const found = extractListingHrefs(html);
        const before = detailHrefs.size;
        for (const h of found) detailHrefs.add(h);
        const added = detailHrefs.size - before;
        log.info(`[pisos] page ${page}: +${added} URLs (total ${detailHrefs.size})`);
        if (added === 0) break;
      } catch (err) {
        errors.push(errorRecord(url, err));
        break;
      }
    }

    const hrefs = Array.from(detailHrefs).slice(0, cap);
    log.info(`[pisos] parseando ${hrefs.length} detalles`);

    for (const href of hrefs) {
      const detailUrl = `${PISOS_BASE}${href}`;
      try {
        const html = await fetchText(detailUrl, { limiter: this.limiter, timeoutMs: 25_000 });
        const property = parseDetail(detailUrl, href, html);
        if (property && matchesPostalFilter(property.postalCode, opts.postalCodes)) {
          results.push(property);
        }
      } catch (err) {
        errors.push(errorRecord(detailUrl, err));
      }
    }

    return {
      results: results.map((p) => ({ source: this.name, property: p })),
      errors,
    };
  }
}

function extractListingHrefs(html: string): string[] {
  const $ = load(html);
  const hrefs = new Set<string>();
  $('a[href^="/comprar/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const clean = href.split('#')[0]?.split('?')[0];
    if (clean && DETAIL_HREF_RE.test(clean)) hrefs.add(clean);
  });
  return Array.from(hrefs);
}

function parseDetail(url: string, href: string, html: string): PropertyUpsertInput | null {
  const $ = load(html);

  const idMatch = href.match(ID_RE);
  if (!idMatch || !idMatch[1] || !idMatch[2]) return null;
  const sourceId = `${idMatch[1]}_${idMatch[2]}`;

  // Tipo del path
  const typeMatch = href.match(/^\/comprar\/([a-z]+)-/);
  const type = typeMatch && typeMatch[1] ? typeMatch[1] : null;

  // Title page
  const ogTitle = $('meta[property="og:title"]').attr('content') ?? $('title').text();
  const ogDescription =
    $('meta[property="og:description"]').attr('content') ??
    $('meta[name="description"]').attr('content') ??
    '';
  const ogUrl = $('meta[property="og:url"]').attr('content') ?? url;

  // Pisos.com usa estructuras como h1 para dirección
  const h1 = cleanWhitespace($('h1').first().text());
  const address = h1 ?? cleanWhitespace(ogTitle.replace(/\s*-\s*pisos\.com.*$/i, '')) ?? null;

  // Descripción larga
  const descriptionBlocks: string[] = [];
  $('[class*="description"], [class*="descrip"]').each((_, el) => {
    const t = cleanWhitespace($(el).text());
    if (t && t.length > 50) descriptionBlocks.push(t);
  });
  let description = descriptionBlocks.length > 0 ? descriptionBlocks.join('\n\n') : null;
  if (!description) description = cleanWhitespace(ogDescription);

  // Características en formato lista
  const features = extractFeatures($);

  // Precio
  const priceText =
    $('[class*="price"]').first().text() ||
    $('[itemprop="price"]').first().attr('content') ||
    $('[itemprop="price"]').first().text() ||
    '';
  const price = parsePriceEur(priceText);

  // m², habitaciones, baños — buscar en features primero, luego texto
  const all = `${features.join(' ')} ${description ?? ''} ${ogDescription}`;
  const m2 = parseSquareMeters(all.match(/(\d{2,4})\s*m\s*[²2]/)?.[0] ?? null);
  const rooms = parseRooms(all.match(/(\d+)\s*(?:hab|dormit|habitac)/i)?.[1] ?? null);
  const bathrooms = parseBathrooms(all.match(/(\d+)\s*baño/i)?.[1] ?? null);
  const yearBuilt = parseYear(all.match(/(?:año|construc[ti][oó]n)\s*:?\s*(\d{4})/i)?.[0] ?? null);

  // CP — del slug o del texto
  let postalCode: string | null = null;
  const slugCp = href.match(/(0[78]\d{3}|17\d{3}|25\d{3}|43\d{3})/);
  if (slugCp && slugCp[1]) postalCode = slugCp[1];
  if (!postalCode) {
    const cpInText = all.match(/\b(0[78]\d{3}|17\d{3}|25\d{3}|43\d{3})\b/);
    if (cpInText && cpInText[1]) postalCode = cpInText[1];
  }

  // Derivar ciudad desde el slug del breadcrumb cuando es posible
  const cityFromSlug = href.match(/^\/comprar\/[a-z]+-([a-z_]+)(?:0\d{4})/i)?.[1];
  const city = cityFromSlug
    ? cityFromSlug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Barcelona';

  // Filtro estricto: descartar propiedades fuera de Catalunya (CP no empieza por 08, 17, 25 o 43)
  if (postalCode && !/^(08|17|25|43)/.test(postalCode)) return null;

  return {
    source: 'pisos',
    sourceId,
    sourceUrl: ogUrl,
    type,
    address,
    city,
    postalCode,
    province: provinceFromPostalCode(postalCode) ?? 'Barcelona',
    m2,
    rooms,
    bathrooms,
    yearBuilt,
    price,
    pricePerM2: pricePerM2(price, m2),
    description,
    descriptionHash: hashDescription(description),
    hasTerrace: detectTerrace(description) ?? features.some((f) => /terraza|balcón/i.test(f)),
    hasElevator: detectElevator(description) ?? features.some((f) => /ascensor/i.test(f)),
    floor: parseFloor(features.find((f) => /planta|piso|ático/i.test(f)) ?? null),
    orientation: detectOrientation(description),
    condition: detectCondition(description),
    isBankOwned: false,
    isAuction: false,
    redFlags: detectRedFlags(description),
    status: 'active',
    rawData: { ogTitle, ogDescription, features },
  };
}

function extractFeatures($: CheerioAPI): string[] {
  const out: string[] = [];
  $('[class*="caracteristica"] li, [class*="feature"] li, [class*="detalle"] li, ul li').each(
    (_, el) => {
      const t = cleanWhitespace($(el).text());
      if (t && t.length < 200) out.push(t);
    },
  );
  return out;
}

function matchesPostalFilter(
  postalCode: string | null | undefined,
  filter: string[] | undefined,
): boolean {
  if (!filter || filter.length === 0) return true;
  if (!postalCode) return true; // No descartamos por CP cuando no podemos parsearlo
  return filter.includes(postalCode);
}

function errorRecord(url: string, err: unknown): CrawlErrorRecord {
  return {
    url,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    at: new Date().toISOString(),
  };
}

const defaultLogger: Logger = {
  info: (m, meta) => console.log(`[INFO] ${m}`, meta ?? ''),
  warn: (m, meta) => console.warn(`[WARN] ${m}`, meta ?? ''),
  error: (m, meta) => console.error(`[ERROR] ${m}`, meta ?? ''),
};
