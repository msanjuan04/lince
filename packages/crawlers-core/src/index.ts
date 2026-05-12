// Utilities compartidos por crawlers: rate limit, robots.txt, dedup, normalizadores.
// User-Agent obligatorio: 'LinceBot/1.0 (+https://lince.cat/bot)'. Ver CLAUDE.md §9.

export * from './user-agent.js';
export * from './rate-limit.js';
export * from './http.js';
export * from './normalize.js';
