// Enricher Catastro — Sede Electrónica del Catastro (sedecatastro.gob.es).
//
// API pública oficial, sin auth. Convertimos una referencia catastral
// (20 chars, formato Solvia/BOE) en lat/lng EPSG:4326 + dirección oficial.
//
// Endpoint: Consulta_CPMRC con la PARCELA (14 chars = los 14 primeros de la
// ref completa de 20 chars). Devuelve XML con <xcen>, <ycen>, <ldt>.
//
// Rate limit conservador (1 req/s). La API es pública pero no abusamos.

import { XMLParser } from 'fast-xml-parser';
import { fetchText, RateLimiter, LINCE_USER_AGENT } from '@lince/crawlers-core';

const CATASTRO_BASE = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC';
const ENDPOINT_COORDS = `${CATASTRO_BASE}/OVCCoordenadas.asmx/Consulta_CPMRC`;

export interface CatastroLookupResult {
  lat: number;
  lng: number;
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
}
