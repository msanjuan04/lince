// Enricher Catastro — Sede Electrónica del Catastro (sedecatastro.gob.es).
//
// API pública oficial, sin auth. Dos llamadas por propiedad cuando hay refCatastral:
//   1. Consulta_CPMRC (XML) → lat/lng EPSG:4326 + dirección oficial.
//   2. Consulta_DNPRC (JSON moderno) → año construcción, superficie catastral
//      oficial, uso (Residencial / Comercial / etc.). NO devuelve valor
//      catastral monetario — eso es dato fiscal protegido (requiere cert).
//
// Útil para enriquecer alertas Telegram y como cross-check del m² del anuncio
// (los vendedores a veces inflan superficie útil).
//
// Rate limit conservador (1 req/s). La API es pública pero no abusamos.

import { XMLParser } from 'fast-xml-parser';
import { fetchText, RateLimiter, LINCE_USER_AGENT } from '@lince/crawlers-core';

const CATASTRO_BASE = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC';
const ENDPOINT_COORDS = `${CATASTRO_BASE}/OVCCoordenadas.asmx/Consulta_CPMRC`;
const ENDPOINT_DNPRC =
  'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC';

export interface CatastroLookupResult {
  lat: number;
  lng: number;
  officialAddress: string | null;
}

export interface CatastroBuildingInfo {
  /** Año de construcción según Catastro (ej. 1965). Null si la API no lo da. */
  yearBuilt: number | null;
  /** Superficie catastral oficial en m² (incluye toda la finca, no solo la vivienda). */
  surfaceM2: number | null;
  /** Uso registrado: "Residencial" / "Comercial" / "Industrial" / "Almacén" / etc. */
  use: string | null;
  /** Dirección oficial Catastro (ldt). */
  officialAddress: string | null;
}

export class CatastroEnricher {
  private readonly limiter = new RateLimiter({ minIntervalMs: 1000 });
  private readonly parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

  /**
   * Resuelve una ref catastral a coordenadas oficiales.
   * Acepta refs de 14 o 20 caracteres — recorta a 14 (parcela) internamente.
   * Devuelve null si la API no encuentra la ref o si la respuesta es inválida.
   */
  async lookup(cadastralRef: string): Promise<CatastroLookupResult | null> {
    const cleaned = cadastralRef.trim().toUpperCase().replace(/\s/g, '');
    if (cleaned.length < 14) return null;
    const parcela = cleaned.slice(0, 14);

    const url = `${ENDPOINT_COORDS}?Provincia=&Municipio=&SRS=EPSG:4326&RC=${encodeURIComponent(parcela)}`;
    let xml: string;
    try {
      xml = await fetchText(url, {
        limiter: this.limiter,
        timeoutMs: 15_000,
        headers: { Accept: 'application/xml,text/xml', 'User-Agent': LINCE_USER_AGENT },
      });
    } catch {
      return null;
    }

    type ConsultaResponse = {
      consulta_coordenadas?: {
        control?: { cucoor?: number; cuerr?: number };
        lerr?: { err?: { cod?: number; des?: string } };
        coordenadas?: {
          coord?: {
            geo?: { xcen?: number; ycen?: number; srs?: string };
            ldt?: string;
          };
        };
      };
    };

    let parsed: ConsultaResponse;
    try {
      parsed = this.parser.parse(xml) as ConsultaResponse;
    } catch {
      return null;
    }

    const root = parsed.consulta_coordenadas;
    if (!root) return null;
    if (root.control?.cuerr && root.control.cuerr > 0) {
      // Error declarado por la API (ej. parcela no existe). No es fatal.
      return null;
    }

    const coord = root.coordenadas?.coord;
    if (!coord?.geo) return null;
    const lng = Number(coord.geo.xcen);
    const lat = Number(coord.geo.ycen);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < 35 || lat > 45 || lng < -10 || lng > 5) {
      // Sanity check: ha de caer dentro de España peninsular + Baleares + Canarias.
      // Si no, descartamos como ruido.
      return null;
    }

    return {
      lat,
      lng,
      officialAddress: coord.ldt ?? null,
    };
  }

  /**
   * Resuelve datos del bien (año, superficie oficial, uso) vía Consulta_DNPRC.
   * Devuelve null si la API no encuentra la ref. Acepta la ref completa de 20
   * chars; internamente la API tolera tanto 14 (parcela) como 20 (cargo+control).
   */
  async lookupBuildingInfo(cadastralRef: string): Promise<CatastroBuildingInfo | null> {
    const cleaned = cadastralRef.trim().toUpperCase().replace(/\s/g, '');
    if (cleaned.length < 14) return null;

    const url = `${ENDPOINT_DNPRC}?Provincia=&Municipio=&RefCat=${encodeURIComponent(cleaned)}`;
    let raw: string;
    try {
      raw = await fetchText(url, {
        limiter: this.limiter,
        timeoutMs: 15_000,
        headers: { Accept: 'application/json', 'User-Agent': LINCE_USER_AGENT },
      });
    } catch {
      return null;
    }

    interface DnprcResponse {
      consulta_dnprcResult?: {
        control?: { cudnp?: number; cuerr?: number };
        lerr?: unknown;
        bico?: {
          bi?: {
            ldt?: string;
            debi?: {
              luso?: string;
              sfc?: string | number;
              ant?: string | number;
            };
          };
        };
      };
    }

    let parsed: DnprcResponse;
    try {
      parsed = JSON.parse(raw) as DnprcResponse;
    } catch {
      return null;
    }

    const root = parsed.consulta_dnprcResult;
    if (!root) return null;
    // Error declarado por la API (ref no existe, formato inválido, etc.)
    if (root.control?.cuerr && root.control.cuerr > 0) return null;

    const bi = root.bico?.bi;
    if (!bi) return null;
    const debi = bi.debi ?? {};

    const yearRaw = debi.ant;
    const yearBuilt = (() => {
      if (yearRaw === undefined || yearRaw === null) return null;
      const n = typeof yearRaw === 'number' ? yearRaw : Number.parseInt(String(yearRaw), 10);
      if (!Number.isFinite(n) || n < 1700 || n > new Date().getFullYear() + 1) return null;
      return n;
    })();

    const sfcRaw = debi.sfc;
    const surfaceM2 = (() => {
      if (sfcRaw === undefined || sfcRaw === null) return null;
      const n = typeof sfcRaw === 'number' ? sfcRaw : Number.parseInt(String(sfcRaw), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
      return n;
    })();

    return {
      yearBuilt,
      surfaceM2,
      use: debi.luso ?? null,
      officialAddress: bi.ldt ?? null,
    };
  }
}
