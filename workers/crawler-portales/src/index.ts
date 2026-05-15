// Public exports del paquete. Permite que `@lince/scheduler` importe las
// sources y el orchestrator sin ejecutar el CLI.

export { SolviaSource } from './sources/solvia';
export { BoeSource } from './sources/boe';
export { PisosSource } from './sources/pisos';
export { ServihabitatSource } from './sources/servihabitat';
export { AlisedaSource } from './sources/aliseda';
export { runSource } from './orchestrator';
export type {
  CrawlerSource,
  CrawlOptions,
  CrawlOutcome,
  CrawlErrorRecord,
  Logger,
  CrawlResult,
} from './sources/types';
export type { OrchestratorResult } from './orchestrator';
