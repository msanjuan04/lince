// Aliseda Inmobiliaria — servicer bank-owned (Santander + SAREB vía Anticipa).
// API descubierto vía DevTools en Chrome: Laravel REST en
// `laravel.alisedainmobiliaria.com/api/v2/new-search` con paginación estándar
// (current_page, last_page, data[], total). El frontend SPA (www.alisedainmobiliaria.com)
// consume este endpoint para listar y filtrar inmuebles.
//
// Cada item del array `data[]` viene con ~80 campos incluyendo sub-objetos:
//   - operacion: { Precio, PrecioAnterior, DescuentoPrecio, Rebajado, ... }
//   - address: { PostalCode, Ciudad, StreetName, Latitude, Longitude, provincia, ... }
//   - vivienda: { Bedrooms, Bathrooms, Ascensor, Terraza, Garage, ... }
//   - imagenes: [{ Uri, Orden, ... }]
//
// Headers requeridos: `application: aliseda` (custom header, sin CSRF ni cookies).
// Rate limit 5s (categoría banca, ver CLAUDE.md §9).

import {
  fetchText,
  RateLimiter,
  detectRedFlags,
  hashDescription,
  pricePerM2,
} from '@lince/crawlers-core';
import type { PropertyUpsertInput } from '@lince/db';
import type { CrawlerSource, CrawlOptions, CrawlOutcome, CrawlErrorRecord, Logger } from './types';

const ALI_API_BASE = 'https://laravel.alisedainmobiliaria.com/api/v2/new-search';
/** Slug del frontend público para construir sourceUrl. */
const ALI_PUBLIC_BASE = 'https://www.alisedainmobiliaria.com';

/** Provincias Catalunya. Orden de prioridad: Barcelona primero. */
const ALI_CATALONIA_PROVINCES = ['barcelona', 'tarragona', 'girona', 'lleida'] as const;

/** Tamaño de página por request — más grande = menos requests al API. */
const PAGE_SIZE = 50;

/** Máximo páginas por provincia (cap defensivo si el endpoint devuelve too much). */
const MAX_PAGES_PER_PROVINCE = 30; // 30 × 50 = 1500 viviendas por provincia, suficiente para uso inicial.

interface AlisedaApiResponse {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  data: AlisedaItem[];
}

interface AlisedaItem {
  id: string;
  original_id?: string;
  FkTipo?: number;
  FkSubtipo?: number;
  ConstructedArea?: number;
  UsableArea?: number;
  RefCatastral?: string;
  EnergyRating?: string;
  Description?: string;
  Estrenar?: number;
  Activo?: number;
  Proindiviso?: number;
  situacionEspecial?: string;
  posesion?: string;
  servicer?: string;
  redComercial?: string;
  obraEjecucion?: number;
  publishedSoon?: number;
  address?: AlisedaAddress;
  vivienda?: AlisedaVivienda;
  operacion?: AlisedaOperacion;
  imagenes?: AlisedaImage[];
  Imagen?: string;
}

interface AlisedaAddress {
  PostalCode?: string;
  Ciudad?: string;
  StreetName?: string;
  StreetNumber?: string;
  TipoVia?: string;
  Piso?: string;
  Latitude?: number;
  Longitude?: number;
  provincia?: { Nombre?: string; comunidad?: { Nombre?: string } };
}

interface AlisedaVivienda {
  Bedrooms?: number;
  Bathrooms?: number;
  Ascensor?: number;
  Terraza?: number;
  Garage?: number;
  Calefaccion?: number;
  PiscinaComunitaria?: number;
  PiscinaPropia?: number;
}

interface AlisedaOperacion {
  Precio?: number;
  PrecioAnterior?: number;
  PrecioM2?: string | number;
  DescuentoPrecio?: number;
  Rebajado?: number;
  PorcentajeOferta?: string;
}

interface AlisedaImage {
  Uri?: string;
  Orden?: string;
}

export class AlisedaSource implements CrawlerSource {
  readonly name = 'aliseda';
  // Banca = 5s mínimo entre requests (CLAUDE.md §9).
  private readonly limiter = new RateLimiter({ minIntervalMs: 5000 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    const cap = opts.maxItems ?? 500;
    // Cap POR PROVINCIA — antes era global y Barcelona (1289 props) saturaba
    // el cap antes de pasar a Tarragona/Girona/Lleida. Resultado: cero
    // inventario Costa Brava / Costa Daurada. Reparto equitativo entre las 4.
    const perProvinceCap = Math.max(20, Math.ceil(cap / ALI_CATALONIA_PROVINCES.length));

    provinceLoop: for (const province of ALI_CATALONIA_PROVINCES) {
      if (results.length >= cap) break;
      let totalForProvince: number | null = null;
      const provinceStartCount = results.length;

      for (let page = 1; page <= MAX_PAGES_PER_PROVINCE; page += 1) {
        if (results.length >= cap) break provinceLoop;
        if (results.length - provinceStartCount >= perProvinceCap) break;
        const url = `${ALI_API_BASE}?tipo=10&provincia=${province}&paginationSize=${PAGE_SIZE}&page=${page}`;
        let json: AlisedaApiResponse;
        try {
          const txt = await fetchText(url, {
            limiter: this.limiter,
            timeoutMs: 25_000,
            headers: {
              Accept: 'application/json',
              // 'application' es header custom requerido por la API Laravel
              // de Aliseda; sin él devuelve 404. Confirmado vía DevTools.
              application: 'aliseda',
              lang: 'es',
              Origin: ALI_PUBLIC_BASE,
              Referer: `${ALI_PUBLIC_BASE}/`,
            },
          });
          json = JSON.parse(txt) as AlisedaApiResponse;
        } catch (err) {
          errors.push(errorRecord(url, err));
          break;
        }

        if (!Array.isArray(json.data)) break;
        if (totalForProvince === null) totalForProvince = json.total ?? json.data.length;

        let pageAdded = 0;
        for (const item of json.data) {
          if (results.length >= cap) break;
          if (results.length - provinceStartCount >= perProvinceCap) break;
          const property = parseAlisedaItem(item);
          if (!property) continue;
          if (!matchesPostalFilter(property.postalCode, opts.postalCodes)) continue;
          results.push(property);
          pageAdded += 1;
        }
        log.info(
          `[aliseda] ${province} page ${page}/${json.last_page}: +${pageAdded} props (acumulado ${results.length}, total provincia ${totalForProvince})`,
        );
        if (page >= json.last_page) break;
        if (json.data.length === 0) break;
      }
    }

    log.info(`[aliseda] total preparadas para upsert: ${results.length}`);

    return {
      results: results.map((p) => ({ source: this.name, property: p })),
      errors,
    };
  }
}

// ----- parsing -----

function parseAlisedaItem(item: AlisedaItem): PropertyUpsertInput | null {
  if (!item.id) return null;
  const op = item.operacion ?? {};
  const addr = item.address ?? {};
  const viv = item.vivienda ?? {};

  const price = typeof op.Precio === 'number' && op.Precio > 0 ? op.Precio : null;
  if (price === null) return null; // sin precio no nos sirve

  const m2 =
    typeof item.ConstructedArea === 'number' && item.ConstructedArea > 0
      ? item.ConstructedArea
      : typeof item.UsableArea === 'number' && item.UsableArea > 0
        ? item.UsableArea
        : null;

  const postalCode = addr.PostalCode ?? null;
  const city = addr.Ciudad ? toTitleCase(addr.Ciudad) : null;
  const provinceName = addr.provincia?.Nombre ?? null;
  const street = [
    addr.TipoVia,
    addr.StreetName,
    addr.StreetNumber,
    addr.Piso ? `${addr.Piso}º` : null,
  ]
    .filter((s) => s && String(s).trim().length > 0)
    .join(' ');
  const address = street.length > 0 ? toTitleCase(street) : null;

  const description = item.Description ? item.Description.trim() : null;
  const redFlags = new Set<string>(detectRedFlags(description));
  if (item.posesion && /ocupad|inquilino|arrendat/i.test(item.posesion)) redFlags.add('occupied');
  if (item.Proindiviso === 1) redFlags.add('proindiviso');
  if (item.situacionEspecial && item.situacionEspecial.trim().length > 0) {
    redFlags.add('special_situation');
  }
  if (item.obraEjecucion === 1) redFlags.add('under_construction');

  const condition = detectCondition(item.Estrenar, description, item.redComercial);

  const type = mapSubtypeToType(item.FkSubtipo, description);

  const mainImageUrl = pickMainImage(item.imagenes, item.Imagen);

  return {
    source: 'aliseda',
    sourceId: item.id,
    sourceUrl: `${ALI_PUBLIC_BASE}/inmueble/${item.id}`,
    type,
    address,
    city,
    postalCode,
    province: provinceName,
    lat: typeof addr.Latitude === 'number' ? addr.Latitude : null,
    lng: typeof addr.Longitude === 'number' ? addr.Longitude : null,
    cadastralRef:
      item.RefCatastral && item.RefCatastral.trim().length > 0 ? item.RefCatastral : null,
    m2,
    rooms: typeof viv.Bedrooms === 'number' ? viv.Bedrooms : null,
    bathrooms: typeof viv.Bathrooms === 'number' ? viv.Bathrooms : null,
    price,
    pricePerM2: pricePerM2(price, m2),
    description,
    descriptionHash: hashDescription(description),
    condition,
    isBankOwned: true,
    isAuction: false,
    hasTerrace: viv.Terraza === 1 ? true : viv.Terraza === 0 ? false : null,
    hasElevator: viv.Ascensor === 1 ? true : viv.Ascensor === 0 ? false : null,
    redFlags: Array.from(redFlags),
    mainImageUrl,
    status: 'active',
    rawData: {
      original_id: item.original_id ?? null,
      FkSubtipo: item.FkSubtipo ?? null,
      EnergyRating: item.EnergyRating ?? null,
      servicer: item.servicer ?? null,
      redComercial: item.redComercial ?? null,
      PrecioAnterior: op.PrecioAnterior ?? null,
      DescuentoPrecio: op.DescuentoPrecio ?? null,
      PorcentajeOferta: op.PorcentajeOferta ?? null,
      Rebajado: op.Rebajado === 1,
      // Fecha de publicación REAL en la web Aliseda — input directo para
      // calcular "días en mercado" en la alerta Telegram.
      FechaPublicacion: (op as { FechaPublicacion?: string }).FechaPublicacion ?? null,
      publishedSoon: item.publishedSoon === 1,
      // Persistimos los campos que disparan red flags para auditoría — si en
      // futuras decisiones cambiamos cómo interpretamos `situacionEspecial`,
      // podemos re-evaluar con la data original sin re-crawlear.
      situacionEspecial: item.situacionEspecial ?? null,
      posesion: item.posesion ?? null,
      Proindiviso: item.Proindiviso ?? null,
      obraEjecucion: item.obraEjecucion ?? null,
    },
  };
}

function pickMainImage(
  images: AlisedaImage[] | undefined,
  fallback: string | undefined,
): string | null {
  if (Array.isArray(images) && images.length > 0) {
    // Prefer fachada / exterior si está, si no la primera.
    const exterior = images.find((im) => im.Orden && /fachada|exterior/i.test(im.Orden));
    const chosen = exterior ?? images[0];
    if (chosen?.Uri && typeof chosen.Uri === 'string') return chosen.Uri;
  }
  if (fallback && typeof fallback === 'string' && fallback.length > 0) return fallback;
  return null;
}

function detectCondition(
  estrenar: number | undefined,
  description: string | null,
  redComercial: string | undefined,
): string {
  if (estrenar === 1) return 'new';
  const d = (description ?? '').toLowerCase();
  if (/reformar|para reformar|a reformar/.test(d)) return 'needs_reform';
  if (/reformado|recién reformado/.test(d)) return 'recently_reformed';
  if (/buen estado|seminuevo|para entrar a vivir/.test(d)) return 'good';
  if (redComercial && /obra\s*nueva/i.test(redComercial)) return 'new';
  return 'unknown';
}

/**
 * FkSubtipo de Aliseda → tipo Lince. Mapeo conocido (a expandir cuando se
 * detecten nuevos códigos en la práctica):
 *   36 = piso
 *   37 = casa/chalet
 *   38 = ático
 *   otros = fallback a regex en description
 */
function mapSubtypeToType(subtype: number | undefined, description: string | null): string {
  if (subtype === 36) return 'piso';
  if (subtype === 37) return 'casa';
  if (subtype === 38) return 'atico';
  const d = (description ?? '').toLowerCase();
  if (/^piso|piso en|^apartamento/.test(d)) return 'piso';
  if (/^casa|^chalet|^villa|adosad/.test(d)) return 'casa';
  if (/^ático|^atico/.test(d)) return 'atico';
  return 'piso'; // default razonable porque tipo=10 ya filtra "viviendas"
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bDe\b|\bDel\b|\bLa\b|\bLas\b|\bLos\b|\bY\b|\bEl\b/g, (m) => m.toLowerCase());
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
