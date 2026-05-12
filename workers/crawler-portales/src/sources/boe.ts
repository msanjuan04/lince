// BOE Subastas — portal oficial. La ficha por defecto (`?ver=1`) muestra los
// datos de la SUBASTA (fecha, valor, tasación). La ficha `?ver=3` muestra los
// datos del BIEN subastado (dirección, CP, referencia catastral, descripción).
// Hacemos dos fetches por subasta para combinar ambos.

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
  parsePriceEur,
  parseSquareMeters,
  parseYear,
  pricePerM2,
  provinceFromPostalCode,
} from '@lince/crawlers-core';
import type { PropertyUpsertInput } from '@lince/db';
import type { CrawlerSource, CrawlOptions, CrawlOutcome, CrawlErrorRecord, Logger } from './types';

const PROVINCE_CODES: Record<string, string> = {
  '08': 'Barcelona',
  '17': 'Girona',
  '25': 'Lleida',
  '43': 'Tarragona',
};

const BOE_BASE = 'https://subastas.boe.es';
const RESULTS_PER_PAGE = 40;
const ID_SUB_RE = /idSub=([A-Z0-9-]+)/;

export class BoeSource implements CrawlerSource {
  readonly name = 'boe';
  private readonly limiter = new RateLimiter({ minIntervalMs: 2500 });

  async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const log = opts.logger ?? defaultLogger;
    const errors: CrawlErrorRecord[] = [];
    const results: PropertyUpsertInput[] = [];

    const provinces = derivProvinces(opts.postalCodes);
    const cap = opts.maxItems ?? 100;

    for (const provCode of provinces) {
      if (results.length >= cap) break;
      const subastaIds = await this.collectSubastaIds(provCode, cap - results.length, log, errors);
      log.info(`[boe] prov ${provCode}: ${subastaIds.length} subastas para parsear`);

      for (const idSub of subastaIds) {
        if (results.length >= cap) break;
        try {
          const subastaHtml = await fetchText(
            `${BOE_BASE}/detalleSubasta.php?idSub=${encodeURIComponent(idSub)}`,
            { limiter: this.limiter, timeoutMs: 25_000 },
          );
          const bienesHtml = await fetchText(
            `${BOE_BASE}/detalleSubasta.php?idSub=${encodeURIComponent(idSub)}&ver=3`,
            { limiter: this.limiter, timeoutMs: 25_000 },
          );
          const property = parseSubasta(idSub, subastaHtml, bienesHtml);
          if (property && matchesPostalFilter(property.postalCode, opts.postalCodes)) {
            results.push(property);
          }
        } catch (err) {
          errors.push(errorRecord(`${BOE_BASE}/detalleSubasta.php?idSub=${idSub}`, err));
        }
      }
    }

    return {
      results: results.map((p) => ({ source: this.name, property: p })),
      errors,
    };
  }

  private async collectSubastaIds(
    provinceCode: string,
    maxNeeded: number,
    log: Logger,
    errors: CrawlErrorRecord[],
  ): Promise<string[]> {
    const ids = new Set<string>();
    let pageOffset = 0;
    let safety = 10;

    while (ids.size < maxNeeded && safety > 0) {
      const url = buildSearchUrl(provinceCode, pageOffset);
      try {
        const html = await fetchText(url, { limiter: this.limiter, timeoutMs: 25_000 });
        const found = extractSubastaIds(html);
        const before = ids.size;
        for (const id of found) ids.add(id);
        const newOnPage = ids.size - before;
        log.info(
          `[boe] prov ${provinceCode} off=${pageOffset}: +${newOnPage} ids (total ${ids.size})`,
        );
        if (found.length === 0 || newOnPage === 0) break;
      } catch (err) {
        errors.push(errorRecord(url, err));
        break;
      }
      pageOffset += RESULTS_PER_PAGE;
      safety -= 1;
    }
    return Array.from(ids).slice(0, maxNeeded);
  }
}

function buildSearchUrl(provinceCode: string, pageOffset: number): string {
  const params = new URLSearchParams({
    'campo[2]': 'SUBASTA.ESTADO.CODIGO',
    'dato[2]': 'EJ',
    'campo[3]': 'BIEN.TIPO',
    'dato[3]': 'I',
    'campo[8]': 'BIEN.COD_PROVINCIA',
    'dato[8]': provinceCode,
    page_hits: String(RESULTS_PER_PAGE),
    'sort_field[0]': 'SUBASTA.FECHA_FIN',
    'sort_order[0]': 'desc',
    accion: 'Buscar',
  });
  const base = `${BOE_BASE}/subastas_ava.php?${params.toString()}`;
  return pageOffset > 0 ? `${base}&numero_busqueda=${pageOffset}` : base;
}

function extractSubastaIds(html: string): string[] {
  const $ = load(html);
  const ids = new Set<string>();
  $('a[href*="detalleSubasta.php"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(ID_SUB_RE);
    if (m && m[1]) ids.add(m[1]);
  });
  return Array.from(ids);
}

/** Lee tablas de definición `<th>label</th><td>value</td>` y devuelve un mapa. */
function readDefTable($: CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $('table tr').each((_, tr) => {
    const th = cleanWhitespace($(tr).find('th').first().text());
    const td = cleanWhitespace($(tr).find('td').first().text());
    if (th && td) {
      // Normalizar label: lowercase, sin tildes
      const key = normalizeLabel(th);
      if (!out[key]) out[key] = td;
    }
  });
  return out;
}

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseSubasta(
  idSub: string,
  subastaHtml: string,
  bienesHtml: string,
): PropertyUpsertInput | null {
  const $subasta = load(subastaHtml);
  const $bienes = load(bienesHtml);

  const subastaData = readDefTable($subasta);
  const bienesData = readDefTable($bienes);

  // ---- Datos de subasta ----
  // "valor_subasta", "tasacion", "puja_minima"
  const valorSubasta = parsePriceEur(subastaData['valor_subasta'] ?? null);
  const tasacion = parsePriceEur(subastaData['tasacion'] ?? null);

  // ---- Datos del bien ----
  // "descripcion", "idufir", "referencia_catastral", "direccion",
  // "codigo_postal", "localidad", "provincia", "situacion_posesoria",
  // "visitable", "cargas", "inscripcion_registral", "titulo_juridico",
  // "informacion_adicional"
  const description = bienesData['descripcion'] ?? null;
  const address = bienesData['direccion'] ?? null;
  const postalCode = bienesData['codigo_postal'] ?? null;
  const city = bienesData['localidad'] ?? null;
  const cadastralRef = bienesData['referencia_catastral'] ?? null;
  const cargas = bienesData['cargas'] ?? null;
  const visitable = bienesData['visitable'] ?? null;
  const situacionPosesoria = bienesData['situacion_posesoria'] ?? null;

  // Tipo del bien — viene en el h4: "Bien 1 - Inmueble (Garaje)"
  let type: string | null = null;
  $bienes('h4').each((_, el) => {
    if (type) return;
    const text = $bienes(el).text();
    const m = text.match(/Bien\s*\d+\s*-\s*[^()]+\(([^)]+)\)/i);
    if (m && m[1]) type = m[1].trim().toLowerCase();
  });

  // Superficie: viene embebida en la descripción del bien. Probamos varios formatos.
  let m2: number | null = null;
  if (description) {
    const m2num =
      description.match(/(\d{2,4}(?:[.,]\d+)?)\s*m\s*[²2]/i) ??
      description.match(/(\d{2,4}(?:[.,]\d+)?)\s*metros\s*cuadrados/i) ??
      description.match(
        /superficie\s+(?:construida|útil|util)?\s*(?:de|:)?\s*(\d{2,4}(?:[.,]\d+)?)/i,
      );
    if (m2num) m2 = parseSquareMeters(m2num[0]);
  }

  // Año de construcción si aparece en la descripción
  let yearBuilt: number | null = null;
  if (description) {
    const yearMatch = description.match(
      /(?:año|construcci[oó]n|construido en|edificada en)\s*:?\s*(\d{4})/i,
    );
    if (yearMatch) yearBuilt = parseYear(yearMatch[0]);
  }

  // Banderas rojas derivadas de campos estructurados del BOE
  const redFlags = new Set<string>(detectRedFlags(description));
  if (cargas && /\d/.test(cargas)) redFlags.add('has_charges');
  if (visitable && /^no/i.test(visitable)) redFlags.add('not_visitable');
  if (situacionPosesoria && /ocupad|inquilino|arrenda/i.test(situacionPosesoria))
    redFlags.add('occupied');

  return {
    source: 'boe',
    sourceId: idSub,
    sourceUrl: `${BOE_BASE}/detalleSubasta.php?idSub=${encodeURIComponent(idSub)}`,
    type,
    address,
    city,
    postalCode,
    province: provinceFromPostalCode(postalCode) ?? bienesData['provincia'] ?? null,
    cadastralRef,
    m2,
    yearBuilt,
    auctionStartingPrice: valorSubasta,
    price: valorSubasta,
    pricePerM2: pricePerM2(valorSubasta, m2),
    description,
    descriptionHash: hashDescription(description),
    hasTerrace: detectTerrace(description),
    hasElevator: detectElevator(description),
    orientation: detectOrientation(description),
    condition: detectCondition(description),
    isBankOwned: false,
    isAuction: true,
    redFlags: Array.from(redFlags),
    status: 'auction',
    rawData: { idSub, tasacion, cargas, situacionPosesoria, visitable },
  };
}

function derivProvinces(postalCodes: string[] | undefined): string[] {
  if (!postalCodes || postalCodes.length === 0) return ['08'];
  const set = new Set<string>();
  for (const cp of postalCodes) {
    const prefix = cp.slice(0, 2);
    if (PROVINCE_CODES[prefix]) set.add(prefix);
  }
  return set.size > 0 ? Array.from(set) : ['08'];
}

function matchesPostalFilter(
  postalCode: string | null | undefined,
  filter: string[] | undefined,
): boolean {
  if (!filter || filter.length === 0) return true;
  if (!postalCode) return true;
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
