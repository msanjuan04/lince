// Parsers y normalizadores comunes de datos inmobiliarios.
// Idempotentes y tolerantes a formatos heterogéneos (España: "85 m²", "85m2", "85,00 m2", etc.).

import { createHash } from 'node:crypto';

const SPACE_RE = /\s+/g;

export function cleanWhitespace(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.replace(SPACE_RE, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Hash estable de la descripción para detectar cambios entre runs (Fase 2). */
export function hashDescription(description: string | null | undefined): string | null {
  const clean = cleanWhitespace(description);
  if (!clean) return null;
  return createHash('sha256').update(clean).digest('hex').slice(0, 32);
}

/** Extrae primer número entero o decimal de un string. Devuelve null si no encuentra. */
function extractNumber(input: string | null | undefined): number | null {
  if (!input) return null;
  const match = input
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .match(/(-?\d+(?:\.\d+)?)/);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** Parsea m² desde strings como "85 m²", "85m2", "85,5 m²". Devuelve entero o null. */
export function parseSquareMeters(input: string | null | undefined): number | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  if (!/m\s*[²2]|metros|m\.|\bsup/i.test(lower)) {
    const onlyNum = extractNumber(lower);
    if (onlyNum && onlyNum > 10 && onlyNum < 2000) return Math.round(onlyNum);
    return null;
  }
  const n = extractNumber(lower);
  if (n === null) return null;
  if (n < 10 || n > 2000) return null;
  return Math.round(n);
}

/** Parsea precio en € desde strings como "285.000 €", "285000€", "285.000,50 €". */
export function parsePriceEur(input: string | null | undefined): number | null {
  if (!input) return null;
  const cleaned = input
    .replace(/[€$\s]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)/);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseFloat(match[1]);
  if (!Number.isFinite(n) || n < 1000 || n > 100_000_000) return null;
  return n;
}

export function parseRooms(input: string | null | undefined): number | null {
  if (!input) return null;
  const n = extractNumber(input);
  if (n === null) return null;
  if (n < 0 || n > 20) return null;
  return Math.round(n);
}

export function parseBathrooms(input: string | null | undefined): number | null {
  if (!input) return null;
  const n = extractNumber(input);
  if (n === null) return null;
  if (n < 0 || n > 15) return null;
  return Math.round(n);
}

export function parseYear(input: string | null | undefined): number | null {
  if (!input) return null;
  const match = input.match(/(\d{4})/);
  if (!match || match[1] === undefined) return null;
  const year = Number.parseInt(match[1], 10);
  const currentYear = new Date().getFullYear();
  if (year < 1800 || year > currentYear + 2) return null;
  return year;
}

const PROVINCE_BY_PREFIX: Record<string, string> = {
  '08': 'Barcelona',
  '17': 'Girona',
  '25': 'Lleida',
  '43': 'Tarragona',
};

/** Deriva provincia a partir de los dos primeros dígitos del CP (Catalunya foco). */
export function provinceFromPostalCode(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const prefix = postalCode.slice(0, 2);
  return PROVINCE_BY_PREFIX[prefix] ?? null;
}

/** Calcula €/m² con 2 decimales. Null si datos insuficientes. */
export function pricePerM2(
  price: number | null | undefined,
  m2: number | null | undefined,
): number | null {
  if (!price || !m2 || m2 <= 0) return null;
  return Math.round((price / m2) * 100) / 100;
}

// --------------------------------------------------------------------------
// Detección de features y banderas (Buckets C, E, banderas rojas)
// --------------------------------------------------------------------------

const TERRACE_PATTERNS = [
  /\bterraza\b/i,
  /\bbalcón\b/i,
  /\bbalcon\b/i,
  /\bpatio\b/i,
  /\btorrac\b/i,
];
const ELEVATOR_PATTERNS = [/\bascensor\b/i, /\belevador\b/i];

export function detectTerrace(text: string | null | undefined): boolean | null {
  if (!text) return null;
  return TERRACE_PATTERNS.some((p) => p.test(text));
}

export function detectElevator(text: string | null | undefined): boolean | null {
  if (!text) return null;
  return ELEVATOR_PATTERNS.some((p) => p.test(text));
}

// Estado / condición — Bucket C
export type PropertyCondition =
  | 'needs_reform'
  | 'partial_reform'
  | 'good'
  | 'recently_reformed'
  | 'new'
  | 'unknown';

export function detectCondition(text: string | null | undefined): PropertyCondition {
  if (!text) return 'unknown';
  const t = text.toLowerCase();
  if (
    /(reformar|a reformar|para reformar|necesita reforma|obra integral|estado original|necesita actualizaci[oó]n|reforma integral)/.test(
      t,
    )
  )
    return 'needs_reform';
  if (/(reforma parcial|actualizado parcialmente|necesita peque[ñn]a reforma)/.test(t))
    return 'partial_reform';
  if (
    /(reformado en \d{4}|reci[eé]n reformado|recientemente reformado|reforma reciente|totalmente reformado)/.test(
      t,
    )
  )
    return 'recently_reformed';
  if (/(obra nueva|a estrenar|nueva construcci[oó]n|primera ocupaci[oó]n)/.test(t)) return 'new';
  if (/(buen estado|impecable|listo para entrar|en perfecto estado)/.test(t)) return 'good';
  return 'unknown';
}

// Banderas rojas — descartes / alertas serias
const RED_FLAG_DEFS: Array<{ flag: string; pattern: RegExp }> = [
  {
    flag: 'occupied',
    pattern:
      /\bokupa(do|da|s|ci[oó]n)?\b|\bocupado(?: ilegalmente)?\b|\bactualmente con inquilinos? sin contrato\b/i,
  },
  {
    flag: 'has_tenant',
    pattern: /\bcon inquilino\b|\bactualmente alquilado\b|\bcontrato vigente\b/i,
  },
  {
    flag: 'vpo',
    pattern: /\bvpo\b|\bvivienda de protecci[oó]n oficial\b|\bprecio m[aá]ximo limitado\b/i,
  },
  {
    flag: 'has_charges',
    pattern: /\bcon cargas\b|\bdeudas pendientes\b|\bembargo\b|\bhipoteca pendiente\b/i,
  },
  {
    flag: 'no_habitability',
    pattern: /\bsin c[eé]dula de habitabilidad\b|\bno tiene c[eé]dula\b/i,
  },
  {
    flag: 'illegal_construction',
    pattern: /\bsin licencia\b|\bconstrucci[oó]n ilegal\b|\bfuera de ordenaci[oó]n\b/i,
  },
];

export function detectRedFlags(text: string | null | undefined): string[] {
  if (!text) return [];
  const flags: string[] = [];
  for (const { flag, pattern } of RED_FLAG_DEFS) {
    if (pattern.test(text)) flags.push(flag);
  }
  return flags;
}

// Orientación
const ORIENTATIONS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'sur', pattern: /\borientaci[oó]n sur\b|\bal sur\b/i },
  { key: 'norte', pattern: /\borientaci[oó]n norte\b|\bal norte\b/i },
  { key: 'este', pattern: /\borientaci[oó]n este\b|\bal este\b|\bsalida del sol\b/i },
  { key: 'oeste', pattern: /\borientaci[oó]n oeste\b|\bal oeste\b|\bpuesta de sol\b/i },
];

export function detectOrientation(text: string | null | undefined): string | null {
  if (!text) return null;
  const found = ORIENTATIONS.find((o) => o.pattern.test(text));
  return found?.key ?? null;
}

/** Parsea planta desde "5ª planta", "planta baja", "ático", "3-4". */
export function parseFloor(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.toLowerCase();
  if (/\b[áa]tico\b/.test(t)) return 'atico';
  if (/\bplanta baja\b|\bp\.? baja\b|\bbajo\b/.test(t)) return 'baja';
  if (/\bsubsuelo\b|\bs[oó]tano\b/.test(t)) return 'sotano';
  if (/\bentresuelo\b/.test(t)) return 'entresuelo';
  if (/\bprincipal\b/.test(t)) return 'principal';
  const num = input.match(/(\d{1,2})\s*[ºª]?\s*(?:planta)?/i);
  if (num && num[1]) {
    const n = Number.parseInt(num[1], 10);
    if (n >= 0 && n <= 50) return String(n);
  }
  return cleanWhitespace(input);
}
