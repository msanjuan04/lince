// Altamira Inmuebles — servicer bank-owned (doValue; gestiona carteras Santander,
// SAREB, BBVA, y fondos como CPPIB). El sitio público (www.altamirainmuebles.com)
// es un SPA React que consume una API interna Node:
//
//   POST https://www.altamirainmuebles.com/nodejs/getResultados
//   Content-Type: application/json
//
// El body lleva `buscador` (provincia + coords del mapa) y `filtros`. GOTCHA:
// sin `limite`, `modoVisualizacion:"L"` y `cntxParamSubastasCodSocsAAM:"1,2,7"`
// la API devuelve solo el contador con `minifichas:[]`. La respuesta es
// `{ totalResultados: "N" (string), minifichas: [...] }`. Cada minificha trae
// precio, superficie, cp, población, lat/lng, tipología, y — a diferencia de
// otras fuentes — el histórico de rebaja nativo (`precioventaanterior` +
// `descuentoventa`, con flags `*01 === -1` cuando no aplica).
//
// Descubierto vía DevTools + bundle `Resultados-*.js`. Sin auth, sin cookies,
// sin header custom. Rate limit 5s (categoría banca, ver CLAUDE.md §9).

import {
  fetchText,
  RateLimiter,
  detectRedFlags,
  hashDescription,
  pricePerM2,
} from '@lince/crawlers-core';
import type { PropertyUpsertInput } from '@lince/db';
import type { CrawlerSource, CrawlOptions, CrawlOutcome, CrawlErrorRecord, Logger } from './types';

const ALT_API = 'https://www.altamirainmuebles.com/nodejs/getResultados';
const ALT_PUBLIC_BASE = 'https://www.altamirainmuebles.com';

// EXCEPCIÓN a la política de UA (CLAUDE.md §9 / docs/legal.md): el WAF de Altamira
// devuelve 403 al UA honesto `LinceBot/1.0` y solo sirve a UAs de navegador. Su
// robots.txt SÍ permite `/nodejs/` (no está en Disallow), así que accedemos a
// datos públicos permitidos; solo necesitamos un UA de navegador para pasar el
// filtro del WAF. Aprobado explícitamente por Marc. Aplica SOLO a este source.
const ALT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Provincias Catalunya con su código INE (idProvincia) y centro aproximado para
 * el campo `buscador` (el mapa; el filtro real de universo es idProvincia).
 * Orden: Barcelona primero (grueso del inventario).
 */
const ALT_CATALONIA_PROVINCES = [
  { id: 8, name: 'Barcelona', lat: 41.38, lng: 2.17 },
  { id: 17, name: 'Girona', lat: 41.98, lng: 2.82 },
  { id: 25, name: 'Lleida', lat: 41.61, lng: 0.62 },
  { id: 43, name: 'Tarragona', lat: 41.11, lng: 1.24 },
] as const;

const PAGE_SIZE = 12; // fijo por la API (`limite:"12"`).
const MAX_PAGES_PER_PROVINCE = 40; // 40 × 12 = 480/provincia, holgado para Catalunya.

interface AltamiraResponse {
  totalResultados?: string | number;
  minifichas?: AltamiraItem[];
}

interface AltamiraFoto {
  urlfoto?: string;
  urlfotogrande?: string;
}

interface AltamiraItem {
  referencia?: string;
  iddcom?: string;
  cinmueble?: number;
  precio?: number;
  superficie?: number;
  numhab?: number;
  numbanos?: number;
  cp?: string;
  calle?: string;
  poblacion?: string;
  zonabarrio?: string;
  provinciaurl?: string;
  latitud?: number;
  longitud?: number;
  tipologia?: string;
  idtipo?: number;
  venta01?: number;
  subasta01?: number;
  credito01?: number;
  suelo01?: number;
  ascensor01?: number;
  terraza01?: number;
  riesgoocupacion?: number;
  condicionesespeciales01?: number;
  precioventaanterior?: number;
  precioventaanterior01?: number;
  descuentoventa?: number;
  descuentoventa01?: number;
  sociedadpropietaria?: string;
  sociedadcliente?: string;
  fotos?: AltamiraFoto[];
}

function buildBody(province: (typeof ALT_CATALONIA_PROVINCES)[number], pagina: number): string {
  return JSON.stringify({
    buscador: {
      idGestion: 1, // venta
      idTipologia: 1, // viviendas
      idProvincia: province.id,
      idPoblacion: null,
      centerLat: province.lat,
      centerLng: province.lng,
      centerZoom: 10,
      provincia: province.name,
    },
    filtros: {
      cntxParamSubastasActivo: '1',
      cntxParamSubastasSarebActivo: '1',
      cntxParamSubastasCodSocsAAM: '1,2,7',
      order: 1,
      pagina,
      limite: String(PAGE_SIZE),
      modoVisualizacion: 'L',
      precioSliderMinimo: 0,
      precioSliderMaximo: 1000000,
      superficieSliderMinima: 0,
      superficieSliderMaxima: 10000,
    },
    totalPaginacion: -1,
    googleMapsRegion: 'ES',
    user: null,
  });
}

export class AltamiraSource implements CrawlerSource {
  readonly name = 'altamira';
  // Banca = 5s mínimo entre requests (CLAUDE.md §9).
  private readonly limiter = new RateLimiter({ minIntervalMs: 5000 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    const cap = opts.maxItems ?? 500;
    const perProvinceCap = Math.max(20, Math.ceil(cap / ALT_CATALONIA_PROVINCES.length));

    provinceLoop: for (const province of ALT_CATALONIA_PROVINCES) {
      if (results.length >= cap) break;
      const provinceStartCount = results.length;

      for (let pagina = 1; pagina <= MAX_PAGES_PER_PROVINCE; pagina += 1) {
        if (results.length >= cap) break provinceLoop;
        if (results.length - provinceStartCount >= perProvinceCap) break;

        let json: AltamiraResponse;
        try {
          const txt = await fetchText(ALT_API, {
            method: 'POST',
            body: buildBody(province, pagina),
            limiter: this.limiter,
            timeoutMs: 25_000,
            headers: {
              // Override del UA por defecto (ver ALT_BROWSER_UA arriba).
              'User-Agent': ALT_BROWSER_UA,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Origin: ALT_PUBLIC_BASE,
              Referer: `${ALT_PUBLIC_BASE}/`,
            },
          });
          json = JSON.parse(txt) as AltamiraResponse;
        } catch (err) {
          errors.push(errorRecord(ALT_API, err));
          break;
        }

        const items = Array.isArray(json.minifichas) ? json.minifichas : [];
        const total = Number(json.totalResultados ?? items.length) || 0;

        let pageAdded = 0;
        for (const item of items) {
          if (results.length >= cap) break;
          if (results.length - provinceStartCount >= perProvinceCap) break;
          const property = parseAltamiraItem(item);
          if (!property) continue;
          if (!matchesPostalFilter(property.postalCode, opts.postalCodes)) continue;
          results.push(property);
          pageAdded += 1;
        }

        const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
        log.info(
          `[altamira] ${province.name} page ${pagina}/${lastPage}: +${pageAdded} props (acumulado ${results.length}, total provincia ${total})`,
        );
        if (items.length === 0) break;
        if (pagina >= lastPage) break;
      }
    }

    log.info(`[altamira] total preparadas para upsert: ${results.length}`);

    return {
      results: results.map((p) => ({ source: this.name, property: p })),
      errors,
    };
  }
}

// ----- parsing -----

function parseAltamiraItem(item: AltamiraItem): PropertyUpsertInput | null {
  // sourceId: preferimos la referencia comercial (estable y humana); fallback a
  // iddcom o cinmueble. Sin ninguno no podemos deduplicar → descartar.
  const sourceId =
    item.referencia ?? item.iddcom ?? (item.cinmueble ? String(item.cinmueble) : null);
  if (!sourceId) return null;

  // Descartamos activos de crédito y suelos: no son vivienda comercializable.
  if (item.credito01 === 1 || item.suelo01 === 1) return null;

  const price = typeof item.precio === 'number' && item.precio > 0 ? item.precio : null;
  if (price === null) return null; // sin precio no nos sirve

  const m2 = typeof item.superficie === 'number' && item.superficie > 0 ? item.superficie : null;

  const postalCode = item.cp && /^\d{5}$/.test(item.cp) ? item.cp : null;
  const city = item.poblacion ? toTitleCase(item.poblacion) : null;
  const province = item.provinciaurl ? toTitleCase(item.provinciaurl) : null;
  const street = [item.calle, item.zonabarrio]
    .filter((s) => s && String(s).trim().length > 0)
    .join(', ');
  const address = street.length > 0 ? toTitleCase(street) : null;

  const redFlags = new Set<string>(detectRedFlags(null));
  if (item.riesgoocupacion && item.riesgoocupacion > 0) redFlags.add('occupancy_risk');
  if (item.condicionesespeciales01 === 1) redFlags.add('special_situation');

  // Rebaja nativa: la API marca *01 === -1 cuando NO hay dato.
  const hasPrevPrice =
    item.precioventaanterior01 !== -1 &&
    typeof item.precioventaanterior === 'number' &&
    item.precioventaanterior > price;
  const previousPrice = hasPrevPrice ? item.precioventaanterior! : null;
  const discountPct =
    item.descuentoventa01 !== -1 &&
    typeof item.descuentoventa === 'number' &&
    item.descuentoventa > 0
      ? item.descuentoventa
      : null;

  return {
    source: 'altamira',
    sourceId,
    // El sitio es un SPA; la ruta pública de ficha por iddcom es la convención
    // observada. Si Altamira cambia el enrutado, ajustar aquí (link cosmético).
    sourceUrl: item.iddcom ? `${ALT_PUBLIC_BASE}/inmueble/${item.iddcom}` : ALT_PUBLIC_BASE,
    type: mapTipologia(item.tipologia),
    address,
    city,
    postalCode,
    province,
    lat: typeof item.latitud === 'number' ? item.latitud : null,
    lng: typeof item.longitud === 'number' ? item.longitud : null,
    cadastralRef: null,
    m2,
    rooms: typeof item.numhab === 'number' ? item.numhab : null,
    bathrooms: typeof item.numbanos === 'number' ? item.numbanos : null,
    price,
    pricePerM2: pricePerM2(price, m2),
    description: null,
    descriptionHash: hashDescription(null),
    condition: 'unknown',
    isBankOwned: true,
    isAuction: item.subasta01 === 1,
    hasTerrace: item.terraza01 === 1 ? true : item.terraza01 === 0 ? false : null,
    hasElevator: item.ascensor01 === 1 ? true : item.ascensor01 === 0 ? false : null,
    redFlags: Array.from(redFlags),
    mainImageUrl: pickMainImage(item.fotos),
    status: 'active',
    rawData: {
      iddcom: item.iddcom ?? null,
      cinmueble: item.cinmueble ?? null,
      tipologia: item.tipologia ?? null,
      idtipo: item.idtipo ?? null,
      sociedadpropietaria: item.sociedadpropietaria ?? null,
      sociedadcliente: item.sociedadcliente ?? null,
      // Rebaja nativa de la fuente → alimenta "histórico de rebajas" en la alerta.
      precioAntes: previousPrice,
      descuentoPct: discountPct,
      subasta: item.subasta01 === 1,
      riesgoocupacion: item.riesgoocupacion ?? null,
      condicionesespeciales: item.condicionesespeciales01 ?? null,
    },
  };
}

function pickMainImage(fotos: AltamiraFoto[] | undefined): string | null {
  if (Array.isArray(fotos) && fotos.length > 0) {
    const f = fotos[0];
    if (f?.urlfotogrande) return f.urlfotogrande;
    if (f?.urlfoto) return f.urlfoto;
  }
  return null;
}

/** Tipología Altamira (string) → tipo Lince. */
function mapTipologia(tipologia: string | undefined): string {
  const t = (tipologia ?? '').toLowerCase();
  if (/ático|atico/.test(t)) return 'atico';
  if (/casa|chalet|villa|adosad|paread|unifamiliar/.test(t)) return 'casa';
  if (/piso|apartamento|dúplex|duplex|estudio|planta/.test(t)) return 'piso';
  return 'piso'; // idTipologia:1 ya filtra viviendas
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
