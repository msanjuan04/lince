// HTTP fetch wrapper con UA Lince, timeout y retry en 429/503.
// Usa fetch nativo de Node 22. Devuelve `Response` para que el caller decida
// si quiere texto, json, o stream.

import { LINCE_USER_AGENT } from './user-agent';
import { type RateLimiter, backoffMs, sleep } from './rate-limit';

export type FetchOptions = {
  /** Headers extra (Accept, Referer, etc.). */
  headers?: Record<string, string>;
  /** Timeout por request, en ms. Default 30s. */
  timeoutMs?: number;
  /** Rate limiter por host. Si no se pasa, no hay rate limit. */
  limiter?: RateLimiter;
  /** Número máximo de reintentos en 429/503. Default 2. */
  maxRetries?: number;
  /** Espera base para backoff, en ms. Default 5000. */
  backoffBaseMs?: number;
  /** Permitir respuestas con código de error sin lanzar. Default false. */
  allowNonOk?: boolean;
  /** Método HTTP. Default GET. Usar POST para APIs internas tipo Altamira. */
  method?: 'GET' | 'POST';
  /** Body a enviar (ya serializado, p.ej. JSON.stringify). Solo con POST. */
  body?: string;
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} on ${url}`);
    this.name = 'HttpError';
  }
}

/** GET con UA Lince, rate limit, timeout y retry exponencial en 429/503. */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const {
    headers = {},
    timeoutMs = 30_000,
    limiter,
    maxRetries = 2,
    backoffBaseMs = 5000,
    allowNonOk = false,
    method = 'GET',
    body,
  } = opts;

  const exec = async (): Promise<Response> => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Usamos `AbortSignal.timeout()` (Node 22+ nativo) en vez del patrón
      // setTimeout + AbortController manual. Más fiable contra TCP slow-loris
      // (server que hace handshake pero no envía body): el timeout efectivo
      // SÍ aborta el await fetch, donde antes podía quedarse colgado y
      // bloquear el run del crawler durante horas. Lo descubrí 2026-05-19
      // tras encontrar un proceso de Pisos.com colgado 11h.
      // AbortError (timeout) y los 429/503 que ya agotaron retries se propagan
      // al caller — no los envolvemos en try/catch porque solo re-lanzaríamos.
      // Los crawlers ya catchean arriba y siguen.
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': LINCE_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.7',
          ...headers,
        },
        ...(body != null ? { body } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status === 503) {
        if (attempt < maxRetries) {
          const wait = backoffMs(attempt, backoffBaseMs, 2, 60_000);
          attempt += 1;
          await sleep(wait);
          continue;
        }
      }
      if (!res.ok && !allowNonOk) {
        const body = await res.text().catch(() => '');
        throw new HttpError(res.status, url, body.slice(0, 500));
      }
      return res;
    }
  };

  return limiter ? limiter.schedule(exec) : exec();
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}
