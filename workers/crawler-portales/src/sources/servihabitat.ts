// Servihabitat — servicer bank-owned (CaixaBank). HTML estático Liferay con
// dos JSON-LD por página:
//   1. BreadcrumbList (categorías de navegación)
//   2. Product → name, image, offers.price, offers.availableAtOrFrom.address
//      con streetAddress, addressLocality, addressRegion, postalCode
//
// Datos que NO vienen en JSON-LD y se extraen del HTML con cheerio:
//   - m² (primer <li> de ul.product_nolist)
//   - condición ("En buen estado", "A reformar", etc., siguientes <li>)
//
// Descubrimiento de URLs: sitemap por provincia
// `https://www.servihabitat.com/es/sitemap-es-<provincia>.xml`. Filtramos solo
// `/es/venta/vivienda/<geo>/<id>` para excluir garajes/trasteros/locales.
//
// Rate limit 5s (categoría banca, ver CLAUDE.md §9). Sin Playwright.

import { load } from 'cheerio';
import {
  fetchText,
  RateLimiter,
  cleanWhitespace,
  detectRedFlags,
  hashDescription,
  parsePriceEur,
  parseSquareMeters,
  parseRooms,
  parseBathrooms,
  pricePerM2,
  provinceFromPostalCode,
} from '@lince/crawlers-core';
import type { PropertyUpsertInput } from '@lince/db';
import type { CrawlerSource, CrawlOptions, CrawlOutcome, CrawlErrorRecord, Logger } from './types';

const SH_BASE = 'https://www.servihabitat.com';
const SH_SITEMAP_INDEX = `${SH_BASE}/es/sitemap-es.xml`;

/**
 * Provincias Catalunya en orden de prioridad (Barcelona primero porque ahí está
 * el grueso del inventario para nuestras 5 zonas activas).
 */
const SH_CATALONIA_PROVINCES = ['barcelona', 'tarragona', 'girona', 'lleida'] as const;

/** Detail URL pattern — solo viviendas, no garajes/trasteros/locales. */
const DETAIL_URL_RE = /^https:\/\/www\.servihabitat\.com\/es\/venta\/vivienda\/[a-z0-9-]+\/\d+$/;

/** Tipos en sitemap que ignoramos por completo. */
const IGNORED_URL_FRAGMENTS = [
  '/venta/garaje/',
  '/venta/trastero/',
  '/venta/local/',
  '/venta/obraparada/',
  '/venta/promociones/',
];

export class ServihabitatSource implements CrawlerSource {
  readonly name = 'servihabitat';
  // Banca = 5s mínimo entre requests (CLAUDE.md §9).
  private readonly limiter = new RateLimiter({ minIntervalMs: 5000 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    // 1. Discover provincial sitemaps (verifica que el índice expone los que esperamos).
    let provinces: readonly string[] = SH_CATALONIA_PROVINCES;
    try {
      const indexXml = await fetchText(SH_SITEMAP_INDEX, {
        limiter: this.limiter,
        timeoutMs: 20_000,
      });
      const fromIndex = SH_CATALONIA_PROVINCES.filter((p) =>
        indexXml.includes(`/sitemap-es-${p}.xml`),
      );
      if (fromIndex.length > 0) provinces = fromIndex;
      log.info(`[servihabitat] sitemap index OK, provincias activas: ${provinces.join(',')}`);
    } catch (err) {
      errors.push(errorRecord(SH_SITEMAP_INDEX, err));
      log.warn(`[servihabitat] sitemap index falló, sigo con default ${provinces.join(',')}`);
    }

    // 2. Recolectar URLs de detalle de cada provincia con cap POR PROVINCIA.
    // Antes se acumulaban TODAS las URLs y luego se cortaba — pero como
    // Barcelona suele ir primero y trae 1000+ vivienda, las otras provincias
    // (Girona/Tarragona/Lleida) nunca entraban en el `slice(0, cap)` final.
    const cap = opts.maxItems ?? 200;
    const perProvinceCap = Math.max(20, Math.ceil(cap / provinces.length));
    const detailUrls: string[] = [];
    for (const province of provinces) {
      if (detailUrls.length >= cap) break;
      const url = `${SH_BASE}/es/sitemap-es-${province}.xml`;
      try {
        const xml = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const found = extractDetailUrlsFromSitemap(xml);
        const startCount = detailUrls.length;
        for (const u of found) {
          if (detailUrls.length >= cap) break;
          if (detailUrls.length - startCount >= perProvinceCap) break;
          if (!detailUrls.includes(u)) detailUrls.push(u);
        }
        log.info(
          `[servihabitat] sitemap ${province}: ${found.length} viviendas (cogidas ${detailUrls.length - startCount}/${perProvinceCap}, acumulado ${detailUrls.length})`,
        );
      } catch (err) {
        errors.push(errorRecord(url, err));
      }
    }

    const urls = detailUrls.slice(0, cap);
    log.info(`[servihabitat] parseando ${urls.length} detalles vía JSON-LD + HTML`);

    // 3. Parsear cada detalle.
    for (const url of urls) {
      try {
        const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const property = parseDetail(url, html);
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

// ----- discovery -----

function extractDetailUrlsFromSitemap(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1];
    if (!url) continue;
    if (IGNORED_URL_FRAGMENTS.some((f) => url.includes(f))) continue;
    if (DETAIL_URL_RE.test(url)) out.push(url);
  }
  return out;
}

// ----- detail parsing -----

interface JsonLdProduct {
  '@type'?: string;
  name?: string;
  image?: string | string[];
  description?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availableAtOrFrom?: {
      address?: {
        streetAddress?: string;
        addressLocality?: string;
        addressRegion?: string;
        postalCode?: string;
      };
    };
  };
}

function parseDetail(url: string, html: string): PropertyUpsertInput | null {
  // sourceId desde el final de la URL
  const idMatch = url.match(/\/(\d+)$/);
  if (!idMatch || !idMatch[1]) return null;
  const sourceId = idMatch[1];

  // Extraer todos los JSON-LD scripts y encontrar el de tipo Product
  const product = extractJsonLdProduct(html);
  if (!product) return null;

  const offers = product.offers;
  const address = offers?.availableAtOrFrom?.address;
  if (!offers || !address) return null;

  const price =
    typeof offers.price === 'number' ? offers.price : parsePriceEur(String(offers.price ?? ''));
  if (!price || price <= 0) return null;

  const postalCode = address.postalCode ?? null;
  const streetAddress = address.streetAddress ?? null;
  const city = address.addressLocality ?? null;
  // addressRegion en Servihabitat es la provincia ("Barcelona", "Girona", ...);
  // la convertimos a forma normalizada con primera letra mayúscula.
  const province =
    normalizeProvince(address.addressRegion ?? null) ?? provinceFromPostalCode(postalCode);

  // Datos del HTML: cheerio sobre la primera ul.product_nolist (la principal,
  // las siguientes son del barrio y datos demográficos que NO sirven).
  const $ = load(html);
  const featureItems: string[] = [];
  $('ul.product_nolist')
    .first()
    .find('li')
    .each((_, el) => {
      const t = cleanWhitespace($(el).text());
      if (t) featureItems.push(t);
    });

  const featureText = featureItems.join(' · ');
  const m2 = parseSquareMeters(featureItems.find((t) => /m2|m²/i.test(t)) ?? null);
  // Habitaciones / baños / planta no suelen aparecer en Servihabitat; mejor
  // dejarlos null que inventar. parseRooms/parseBathrooms tolerantes a null.
  const rooms = parseRooms(featureText.match(/(\d+)\s*hab/i)?.[1] ?? null);
  const bathrooms = parseBathrooms(featureText.match(/(\d+)\s*baño/i)?.[1] ?? null);

  // Descripción: og:description suele ser literal "Servihabitat" (inútil).
  // Usamos el name del JSON-LD + featureText como descripción mínima.
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? '';
  const usableOgDescription =
    ogDescription && !/^servihabitat$/i.test(ogDescription.trim()) ? ogDescription : null;
  const description = cleanWhitespace(
    [product.name ?? null, featureText || null, usableOgDescription].filter(Boolean).join('. '),
  );

  // Condition: detectar en featureText.
  const condition = detectConditionFromFeatures(featureText);

  // Tipo: por defecto vivienda → 'piso'. Si el name menciona "casa" / "chalet" → 'casa'.
  const lowerName = (product.name ?? '').toLowerCase();
  const type = /(casa|chalet|villa|adosad)/i.test(lowerName)
    ? 'casa'
    : /(ático|atico)/i.test(lowerName)
      ? 'atico'
      : /(local|nave|oficina)/i.test(lowerName)
        ? 'local'
        : 'piso';

  // Red flags desde descripción.
  const redFlags = Array.from(new Set(detectRedFlags(description)));

  // Fecha de publicación del inmueble en Servihabitat (Drupal field). Si está
  // como ISO en el <time datetime="..."> dentro de field--name-publication-date,
  // la usamos como referencia real. Fallback a field--name-created (cuando Drupal
  // creó el nodo, suele ser cercano).
  const fechaPublicacion =
    $('.field--name-publication-date time').first().attr('datetime') ??
    $('.field--name-created time').first().attr('datetime') ??
    null;

  // Imagen principal: del JSON-LD `image` (puede ser string o array).
  const imageRaw = Array.isArray(product.image) ? product.image[0] : product.image;
  const mainImageUrl = imageRaw && typeof imageRaw === 'string' ? imageRaw : null;

  return {
    source: 'servihabitat',
    sourceId,
    sourceUrl: url,
    type,
    address: streetAddress,
    city,
    postalCode,
    province,
    m2,
    rooms,
    bathrooms,
    price,
    pricePerM2: pricePerM2(price, m2),
    description,
    descriptionHash: hashDescription(description),
    condition,
    isBankOwned: true,
    isAuction: false,
    redFlags,
    mainImageUrl,
    status: 'active',
    rawData: {
      jsonLdName: product.name ?? null,
      featureItems,
      // Fecha publicación real de Servihabitat (Drupal `publication_date` o
      // `created`). evaluate-zones la usa para mostrar "Publicado hace Xd".
      FechaPublicacion: fechaPublicacion,
    },
  };
}

function extractJsonLdProduct(html: string): JsonLdProduct | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as JsonLdProduct;
      if (parsed && parsed['@type'] === 'Product' && parsed.offers) return parsed;
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function detectConditionFromFeatures(featureText: string): string {
  const t = featureText.toLowerCase();
  if (/obra nueva|a estrenar|nuevo/i.test(t)) return 'new';
  if (/a reformar|para reformar|reformar/i.test(t)) return 'needs_reform';
  if (/reformado|recién reformado/i.test(t)) return 'recently_reformed';
  if (/buen estado|seminuevo/i.test(t)) return 'good';
  return 'unknown';
}

function normalizeProvince(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.includes('barcelona')) return 'Barcelona';
  if (cleaned.includes('girona') || cleaned.includes('gerona')) return 'Girona';
  if (cleaned.includes('tarragona')) return 'Tarragona';
  if (cleaned.includes('lleida') || cleaned.includes('lérida') || cleaned.includes('lerida'))
    return 'Lleida';
  return raw.trim();
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
