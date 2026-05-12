// Solvia — bank-owned servicer. Angular SSR con `<script id="ng-state">` que
// contiene el state completo de la página, incluido `propertyBasicDetail` con
// precio, m², CP, dirección, características y alquiler estimado. Sin Playwright.

import { load } from 'cheerio';
import {
  fetchText,
  RateLimiter,
  cleanWhitespace,
  detectRedFlags,
  hashDescription,
  parsePriceEur,
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
const NG_STATE_RE = /<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/;

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
      log.warn(`[solvia] sitemap falló, sigo con DEFAULT_MUNICIPALITIES`);
    }

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
      }
    }

    const cap = opts.maxItems ?? detailUrls.size;
    const urls = Array.from(detailUrls).slice(0, cap);
    log.info(`[solvia] parseando ${urls.length} detalles vía ng-state JSON`);

    for (const url of urls) {
      try {
        const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const property = parseDetailFromNgState(url, html);
        if (property && matchesPostalFilter(property.postalCode, opts.postalCodes)) {
          results.push(property);
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

// ----- helpers -----

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
      const clean = absolute.split('#')[0]?.split('?')[0];
      if (clean) urls.add(clean);
    }
  });
  return Array.from(urls);
}

/** Estructura mínima del nodo `propertyBasicDetail` que nos interesa. */
interface PropertyBasicDetail {
  id?: string;
  idVivienda?: string;
  idPromocion?: string;
  textoDescripcion?: string;
  tituloFicha?: string;
  cp?: string;
  m2?: number;
  precio?: number;
  precioAntes?: number | null;
  cuotaAlquiler?: number;
  direccion?: string;
  mostrarPrecio?: string;
  poblacion?: { name?: string };
  categoriaTipoVivienda?: { name?: string };
  caracteristicas?: {
    refCatastral?: string;
    reformar?: boolean;
    estado?: string;
    vpo?: boolean;
    amueblado?: boolean;
    importeIbi?: number | null;
    importeGastosComunidad?: number | null;
  };
  campanya?: { name?: string };
  enSituacionEspecial?: string;
}

function parseDetailFromNgState(url: string, html: string): PropertyUpsertInput | null {
  const match = html.match(NG_STATE_RE);
  if (!match || !match[1]) return null;

  let state: unknown;
  try {
    state = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!state || typeof state !== 'object') return null;

  const detail = (state as Record<string, unknown>).propertyBasicDetail as
    | PropertyBasicDetail
    | undefined;
  if (!detail) return null;

  // source_id desde la URL (mantiene el formato 26977-54362 igual que antes)
  const idMatch = url.match(DETAIL_ID_RE);
  if (!idMatch || !idMatch[1] || !idMatch[2]) return null;
  const sourceId = `${idMatch[1]}-${idMatch[2]}`;

  const description = cleanWhitespace(detail.textoDescripcion ?? null);
  const characteristics = detail.caracteristicas ?? {};

  const condition = mapEstadoToCondition(characteristics.estado, characteristics.reformar);

  // Red flags: estructuradas (vpo, ocupado vía estado especial) + texto libre
  const redFlags = new Set<string>(detectRedFlags(description));
  if (characteristics.vpo === true) redFlags.add('vpo');
  if (
    detail.enSituacionEspecial === '1' ||
    /ocupacional|inquilino|arrendat|estado ocupacional/i.test(description ?? '')
  )
    redFlags.add('occupied');
  if (detail.mostrarPrecio === 'N') redFlags.add('hidden_price');

  // type: Solvia categoriza como "Viviendas", "Suelos", "Locales", etc. Mapeamos.
  const tipoVivienda = detail.categoriaTipoVivienda?.name?.toLowerCase() ?? '';
  const type = mapTipoVivienda(tipoVivienda, detail.tituloFicha);

  // precio: precioAntes si hay rebaja, si no precio.
  // Nos interesa el precio ACTUAL (`precio`), el precioAntes podría servir
  // para histórico pero esta fase no lo persistimos.
  const price =
    typeof detail.precio === 'number' ? detail.precio : parsePriceEur(String(detail.precio ?? ''));
  const m2 = typeof detail.m2 === 'number' && detail.m2 > 0 ? detail.m2 : null;

  return {
    source: 'solvia',
    sourceId,
    sourceUrl: url,
    type,
    address: detail.direccion ?? null,
    city: detail.poblacion?.name ?? null,
    postalCode: detail.cp ?? null,
    province: provinceFromPostalCode(detail.cp ?? null),
    cadastralRef: characteristics.refCatastral ?? null,
    m2,
    price,
    pricePerM2: pricePerM2(price, m2),
    description,
    descriptionHash: hashDescription(description),
    condition,
    isBankOwned: true,
    isAuction: false,
    redFlags: Array.from(redFlags),
    status: 'active',
    rawData: {
      idSolvia: detail.id,
      precioAntes: detail.precioAntes ?? null,
      cuotaAlquilerEur: detail.cuotaAlquiler ?? null,
      importeIbi: characteristics.importeIbi ?? null,
      importeGastosComunidad: characteristics.importeGastosComunidad ?? null,
      campanya: detail.campanya?.name ?? null,
      tipoVivienda,
    },
  };
}

function mapTipoVivienda(tipoVivienda: string, tituloFicha: string | undefined): string | null {
  // Solvia: "Viviendas", "Suelos", "Locales", "Garajes y trasteros", "Oficinas", "Naves"
  if (tipoVivienda.includes('vivienda')) {
    // Refinamos con título de ficha si está disponible (a veces "Piso", "Casa", etc.)
    if (tituloFicha) {
      const t = tituloFicha.toLowerCase();
      if (/(piso|apartamento|estudio)/.test(t)) return 'piso';
      if (/(casa|chalet|villa)/.test(t)) return 'casa';
      if (/(ático|atico)/.test(t)) return 'atico';
    }
    return 'piso'; // default razonable
  }
  if (tipoVivienda.includes('suelo')) return 'terreno';
  if (tipoVivienda.includes('local')) return 'local';
  if (tipoVivienda.includes('oficina')) return 'local';
  if (tipoVivienda.includes('nave')) return 'local';
  if (tipoVivienda.includes('garaje') || tipoVivienda.includes('trastero')) return 'local';
  return null;
}

function mapEstadoToCondition(
  estado: string | null | undefined,
  reformar: boolean | undefined,
): string {
  if (reformar === true) return 'needs_reform';
  if (!estado) return 'unknown';
  const e = estado.toLowerCase();
  if (e.includes('obra nueva') || e.includes('estrenar')) return 'new';
  if (e.includes('reformar') || e.includes('a reformar')) return 'needs_reform';
  if (e.includes('reformado')) return 'recently_reformed';
  if (e.includes('buen estado') || e.includes('seminuevo')) return 'good';
  return 'unknown';
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
