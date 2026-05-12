// Rate limiter por host: cola FIFO + intervalo mínimo entre requests.
// Backoff exponencial al recibir 429/503. Sin reintentos agresivos.

export type RateLimitOptions = {
  /** Intervalo mínimo entre requests, en milisegundos. */
  minIntervalMs: number;
  /** Máximo número de reintentos en caso de 429/503. */
  maxRetries?: number;
  /** Multiplicador del backoff. */
  backoffMultiplier?: number;
  /** Tope superior del backoff. */
  maxBackoffMs?: number;
};

type QueueEntry = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/**
 * Rate limiter serial: garantiza al menos `minIntervalMs` entre el inicio de
 * dos requests. Un limiter por host. No paraleliza — la prioridad es ser
 * conservador con el origen.
 */
export class RateLimiter {
  private readonly opts: Required<RateLimitOptions>;
  private queue: QueueEntry[] = [];
  private lastStart = 0;
  private running = false;

  constructor(opts: RateLimitOptions) {
    this.opts = {
      maxRetries: 2,
      backoffMultiplier: 2,
      maxBackoffMs: 60_000,
      ...opts,
    };
  }

  /** Encola una función `run` y la ejecuta respetando el rate limit. */
  schedule<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: run as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift();
        if (!entry) break;
        const wait = this.lastStart + this.opts.minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        this.lastStart = Date.now();
        try {
          const result = await entry.run();
          entry.resolve(result);
        } catch (err) {
          entry.reject(err);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Backoff exponencial con jitter. */
export function backoffMs(attempt: number, base: number, multiplier: number, cap: number): number {
  const exp = base * Math.pow(multiplier, attempt);
  const jitter = exp * 0.25 * Math.random();
  return Math.min(cap, exp + jitter);
}
