// Interfaz común para todas las fuentes de inmuebles.
// Cada fuente implementa `crawl(opts)` que devuelve un stream de propiedades parseadas.

import type { PropertyUpsertInput } from '@lince/db';

export type CrawlOptions = {
  /** Códigos postales objetivo. Filtro a aplicar (la fuente puede ignorarlo si no soporta). */
  postalCodes?: string[];
  /** Máximo de propiedades a obtener en este run (safety cap). */
  maxItems?: number;
  /** Logger inyectable (default console). */
  logger?: Logger;
};

export type Logger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

export type CrawlResult = {
  source: string;
  property: PropertyUpsertInput;
};

export type CrawlErrorRecord = {
  url?: string;
  message: string;
  stack?: string;
  at: string;
};

export type CrawlOutcome = {
  results: CrawlResult[];
  errors: CrawlErrorRecord[];
};

export interface CrawlerSource {
  /** Identificador estable de la fuente (`solvia`, `pisos`, `boe`). Va a `Property.source`. */
  readonly name: string;
  /** Ejecuta el crawl y devuelve resultados + errores. Nunca lanza. */
  crawl(opts: CrawlOptions): Promise<CrawlOutcome>;
}
