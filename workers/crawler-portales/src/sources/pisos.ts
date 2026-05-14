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
import type { CrawlerSource, CrawlOptions, CrawlOutcome, CrawlErrorRecord, Logger } from './types';

const PISOS_BASE = 'https://www.pisos.com';
const DETAIL_HREF_RE =
  /^\/comprar\/(?:piso|casa|atico|chalet|local|estudio|apartamento)-([a-z0-9_-]+)\/?$/i;
const ID_RE = /-(\d+)_(\d+)\/?$/;
const MAX_PAGES_PER_CITY = 6;

/**
 * Slugs verificados (HTTP 200 con UA LinceBot/1.0, mayo 2026). Si añades una
 * ciudad nueva, antes prueba que `https://www.pisos.com/venta/pisos-<slug>/`
 * devuelva 200 — la convención no siempre es obvia (ej. L'Hospitalet va sin
 * la "l_" inicial: `hospitalet_de_llobregat`).
 */
const PISOS_CITY_SLUGS = [
  'barcelona_capital',
  'sant_cugat_del_valles',
  'badalona',
  'hospitalet_de_llobregat',
  'vilassar_de_mar',
  'sabadell',
] as const;

export class PisosSource implements CrawlerSource {
  readonly name = 'pisos';
  private readonly limiter = new RateLimiter({ minIntervalMs: 3500 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    const cap = opts.maxItems ?? 150;
    const detailHrefs = new Set<string>();

    // Quota por ciudad para repartir el cap proporcionalmente. Sin esto, BCN
    // capital saturaría las primeras páginas y las otras ciudades nunca
    // entrarían en el run.
    const perCityCap = Math.max(5, Math.ceil(cap / PISOS_CITY_SLUGS.length));

    cityLoop: for (const city of PISOS_CITY_SLUGS) {
      const cityListBase = `${PISOS_BASE}/venta/pisos-${city}/`;
      let cityCount = 0;

      for (let page = 1; page <= MAX_PAGES_PER_CITY; page += 1) {
        if (detailHrefs.size >= cap) break cityLoop;
        if (cityCount >= perCityCap) break;
        const url = page === 1 ? cityListBase : `${cityListBase}${page}/`;
        try {
          const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
          const found = extractListingHrefs(html);
          let added = 0;
          for (const h of found) {
            // Por página de ciudad: no nos llevamos más hrefs de los que esa
            // ciudad puede aportar (perCityCap). Sin esto, una página con 30
            // listings de Barcelona llenaría el cap global antes de pasar a la
            // siguiente ciudad.
            if (cityCount >= perCityCap) break;
            if (detailHrefs.size >= cap) break;
            if (!detailHrefs.has(h)) {
              detailHrefs.add(h);
              cityCount += 1;
              added += 1;
            }
          }
          log.info(
            `[pisos] ${city} page ${page}: +${added} URLs (city=${cityCount}/${perCityCap}, total ${detailHrefs.size})`,
          );
          if (added === 0) break;
        } catch (err) {
          errors.push(errorRecord(url, err));
          break;
        }
      }
    }

    const hrefs = Array.from(detailHrefs).slice(0, cap);
    log.info(`[pisos] parseando ${hrefs.length} detalles de ${PISOS_CITY_SLUGS.length} ciudades`);

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
  const mainImageUrl = pickPisosMainImage($);

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
    mainImageUrl,
    status: 'active',
    rawData: { ogTitle, ogDescription, features, mainImageUrl },
  };
}

/**
 * Foto principal de la ficha. Pisos.com expone og:image (siempre presente en
 * fichas estándar). Fallback al primer <img> dentro del carrusel principal.
 */
function pickPisosMainImage($: CheerioAPI): string | null {
  const og = $('meta[property="og:image"]').attr('content');
  if (og && og.trim()) {
    const url = og.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
  }
  // Fallback: primer img del carousel/gallery con URL absoluta
  let fallback: string | null = null;
  $('[class*="carousel"] img, [class*="gallery"] img, [class*="slider"] img, picture img').each(
    (_, el) => {
      if (fallback) return;
      const src =
        $(el).attr('data-src') ??
        $(el).attr('data-original') ??
        $(el).attr('src') ??
        $(el).attr('srcset')?.split(',')[0]?.trim().split(' ')[0];
      if (!src) return;
      if (src.startsWith('http')) fallback = src;
      else if (src.startsWith('//')) fallback = `https:${src}`;
    },
  );
  return fallback;
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
