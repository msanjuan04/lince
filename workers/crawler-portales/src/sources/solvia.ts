// Solvia — bank-owned servicer. SSR Angular: el HTML servido trae las URLs
// individuales sin necesidad de Playwright. Parseo de detalle con Cheerio.

import { load } from 'cheerio';
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

const MUNICIPALITY_URL_RE =
  /^https:\/\/www\.solvia\.es\/es\/comprar\/viviendas\/barcelona\/[a-z0-9-]+$/;
const DETAIL_URL_RE = /^https?:\/\/www\.solvia\.es\/es\/propiedades\/comprar\/[a-z0-9-]+/;
const DETAIL_ID_RE = /-(\d+)-(\d+)(?:\/?)?$/;
const SITEMAP_URL = 'https://www.solvia.es/sitemap_comprar_viviendas.xml';

/** Municipios objetivo por defecto: Barcelona ciudad + área metropolitana cercana. */
const DEFAULT_MUNICIPALITIES = [
  'barcelona',
  'lhospitalet-de-llobregat',
  'badalona',
  'santa-coloma-de-gramenet',
  'sant-adria-de-besos',
  'esplugues-de-llobregat',
  'cornella-de-llobregat',
  'sant-cugat-del-valles',
];

export class SolviaSource implements CrawlerSource {
  readonly name = 'solvia';
  private readonly limiter = new RateLimiter({ minIntervalMs: 3000 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    // 1) Sitemap → lista de municipios de Barcelona
    let municipalities: string[] = DEFAULT_MUNICIPALITIES;
    try {
      const xml = await fetchText(SITEMAP_URL, { limiter: this.limiter, timeoutMs: 20_000 });
      const fromSitemap = extractBarcelonaMunicipalities(xml);
      if (fromSitemap.length > 0) {
        municipalities = Array.from(new Set([...DEFAULT_MUNICIPALITIES, ...fromSitemap]));
      }
      log.info(`[solvia] sitemap OK, ${fromSitemap.length} municipios provincia BCN`);
    } catch (err) {
      errors.push(errorRecord(SITEMAP_URL, err));
      log.warn(`[solvia] sitemap falló, sigo con DEFAULT_MUNICIPALITIES`, { err: String(err) });
    }

    // 2) Por cada municipio, extraer URLs de inmueble del HTML del listado
    const detailUrls = new Set<string>();
    for (const muni of municipalities) {
      if (opts.maxItems && detailUrls.size >= opts.maxItems) break;
      const url = `https://www.solvia.es/es/comprar/viviendas/barcelona/${muni}`;
      try {
        const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const found = extractDetailUrls(html);
        for (const u of found) detailUrls.add(u);
        log.info(`[solvia] ${muni}: ${found.length} URLs (total ${detailUrls.size})`);
      } catch (err) {
        errors.push(errorRecord(url, err));
        log.warn(`[solvia] municipio ${muni} falló`, { err: String(err) });
      }
    }

    // 3) Fetch detalle de cada URL única y parsear
    const cap = opts.maxItems ?? detailUrls.size;
    const urls = Array.from(detailUrls).slice(0, cap);
    log.info(`[solvia] parseando ${urls.length} detalles`);

    for (const url of urls) {
      try {
        const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const property = parseDetail(url, html);
        if (property) {
          if (matchesPostalFilter(property.postalCode, opts.postalCodes)) {
            results.push(property);
          }
        }
      } catch (err) {
        errors.push(errorRecord(url, err));
      }
    }

    return {
      results: results.map((p) => ({ source: this.name, property: p })),
      errors,
    };
  }
}

// ----- helpers internos -----

function extractBarcelonaMunicipalities(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1];
    if (url && MUNICIPALITY_URL_RE.test(url)) {
      const muni = url.split('/').pop();
      if (muni) out.push(muni);
    }
  }
  return out;
}

function extractDetailUrls(html: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();
  $('a[href*="/es/propiedades/comprar/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const absolute = href.startsWith('http') ? href : `https://www.solvia.es${href}`;
    if (DETAIL_URL_RE.test(absolute)) {
      // Limpiar fragmentos/queries
      const clean = absolute.split('#')[0]?.split('?')[0];
      if (clean) urls.add(clean);
    }
  });
  return Array.from(urls);
}

function parseDetail(url: string, html: string): PropertyUpsertInput | null {
  const $ = load(html);

  const idMatch = url.match(DETAIL_ID_RE);
  if (!idMatch || !idMatch[1] || !idMatch[2]) return null;
  const sourceId = `${idMatch[1]}-${idMatch[2]}`;

  const ogTitle = $('meta[property="og:title"]').attr('content') ?? '';
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? '';
  const ogUrl = $('meta[property="og:url"]').attr('content') ?? url;

  // Página completa como descripción (incluye texto principal). Limpieza ligera.
  const mainText =
    cleanWhitespace($('main').text()) ??
    cleanWhitespace($('app-property-detail').text()) ??
    cleanWhitespace($('body').text()) ??
    null;

  const description = cleanWhitespace(ogDescription) ?? mainText;

  // Tipo: "Piso", "Casa", etc. — del title OG
  const typeMatch = ogTitle.match(
    /^(Piso|Casa|Chalet|Estudio|Local|Oficina|Garaje|Trastero|Suelo|Nave|Apartamento|Ático|Atico)/i,
  );
  const type = typeMatch && typeMatch[1] ? typeMatch[1].toLowerCase() : null;

  // Address y ciudad: del title OG → "Piso en venta en C/ Villarroel, Barcelona, Barcelona - …"
  let address: string | null = null;
  let city: string | null = null;
  const addrMatch = ogTitle.match(/en venta en\s+([^|]+?)\s*(?:\|.*)?$/i);
  if (addrMatch && addrMatch[1]) {
    const parts = addrMatch[1]
      .split(/\s*-\s*|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    address = parts[0] ?? null;
    city = parts[1] ?? null;
  }

  // m² del og:description o del texto
  const m2Match = (ogDescription + ' ' + (mainText ?? '')).match(/(\d{2,4})\s*m\s*[²2]/);
  const m2 = m2Match && m2Match[1] ? parseSquareMeters(m2Match[0]) : null;

  // Dormitorios del title → "2-dormitorios" o de la descripción
  const dormMatch =
    ogTitle.match(/(\d+)[-\s]dormitor/i) ?? (mainText ?? '').match(/(\d+)\s*dormitor/i);
  const rooms = dormMatch && dormMatch[1] ? parseRooms(dormMatch[1]) : null;

  const bathMatch = (mainText ?? '').match(/(\d+)\s*baño/i);
  const bathrooms = bathMatch && bathMatch[1] ? parseBathrooms(bathMatch[1]) : null;

  const yearMatch = (mainText ?? '').match(
    /(?:año|construc[ti][oó]n|construido en)\s*:?\s*(\d{4})/i,
  );
  const yearBuilt = yearMatch ? parseYear(yearMatch[0]) : null;

  // Precio — buscar patrón "€ 150.000" o "150.000 €"
  const priceMatch =
    html.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)\s*€/) ??
    html.match(/€\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)/);
  const price = priceMatch ? parsePriceEur(priceMatch[0]) : null;

  // CP — buscar 5 dígitos en el texto principal o en address
  const cpMatch = (mainText ?? html).match(/\b(0[78]\d{3}|17\d{3}|25\d{3}|43\d{3})\b/);
  const postalCode = cpMatch ? cpMatch[1] : null;

  // Referencia catastral si aparece (Solvia a veces la expone)
  const refCadMatch = (mainText ?? '').match(/\b([0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2})\b/);
  const cadastralRef = refCadMatch ? refCadMatch[1] : null;

  return {
    source: 'solvia',
    sourceId,
    sourceUrl: ogUrl,
    type,
    address,
    city,
    postalCode,
    province: provinceFromPostalCode(postalCode),
    m2,
    rooms,
    bathrooms,
    yearBuilt,
    price,
    pricePerM2: pricePerM2(price, m2),
    description,
    descriptionHash: hashDescription(description),
    cadastralRef,
    hasTerrace: detectTerrace(description),
    hasElevator: detectElevator(description),
    floor: parseFloor(description ?? ''),
    orientation: detectOrientation(description),
    condition: detectCondition(description),
    isBankOwned: true,
    isAuction: false,
    redFlags: detectRedFlags(description),
    status: 'active',
    rawData: { ogTitle, ogDescription, mainTextLength: mainText?.length ?? 0 },
  };
}

function matchesPostalFilter(
  postalCode: string | null | undefined,
  filter: string[] | undefined,
): boolean {
  if (!filter || filter.length === 0) return true;
  if (!postalCode) return false;
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
