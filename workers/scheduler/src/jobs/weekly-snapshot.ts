// Job: ejecuta los crawlers de las fuentes Tier verde en secuencia.
//   Pisos.com → BOE → Solvia
//
// Secuencial (no paralelo) por dos razones:
//   1. Cada fuente tiene su rate limit propio. Concurrencia no acelera.
//   2. La DB Supabase tiene un pool limitado en el Transaction pooler (6543).
//      Mejor no presionarlo con N runs simultáneos.
//
// Cada `runSource` registra su fila en `crawler_runs` con status, contadores
// y errores. El job aquí solo orquesta y loggea el resumen.

import {
  BoeSource,
  PisosSource,
  SolviaSource,
  runSource,
  type CrawlerSource,
  type OrchestratorResult,
} from '@lince/crawler-portales';
import { runEnrichCatastro, type EnrichCatastroResult } from './enrich-catastro';
import { runEvaluateZones, type EvaluateZonesResult } from './evaluate-zones';
import { runDetectDisappeared, type DetectDisappearedResult } from './detect-disappeared';
import { runAnalyzePhotos, type AnalyzePhotosResult } from './analyze-photos';

export interface WeeklySnapshotOptions {
  /** Fuentes a ejecutar (orden importa). Por defecto: pisos, boe, solvia. */
  sources?: string[];
  /** Máximo de propiedades por fuente. Por defecto 50. */
  maxPerSource?: number;
  /** CPs a filtrar (aplica a todas las fuentes que soporten filtro). */
  postalCodes?: string[];
  /** Si true, después del crawl ejecuta el enricher Catastro. Default true. */
  enrichCatastro?: boolean;
  /** Si true, evalúa zonas y dispara alertas. Default true. */
  evaluateZones?: boolean;
  /** Si true, marca propiedades desaparecidas (alimenta mediana absorción). Default true. */
  detectDisappeared?: boolean;
  /** Si true, ejecuta Claude Vision sobre top N props pendientes. Default true. */
  analyzePhotos?: boolean;
}

export interface WeeklySnapshotResult {
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  runs: OrchestratorResult[];
  enrichCatastro?: EnrichCatastroResult;
  evaluateZones?: EvaluateZonesResult;
  detectDisappeared?: DetectDisappearedResult;
  analyzePhotos?: AnalyzePhotosResult;
  totals: {
    propertiesFound: number;
    propertiesNew: number;
    propertiesUpdated: number;
    errors: number;
  };
}

const SOURCE_REGISTRY: Record<string, () => CrawlerSource> = {
  pisos: () => new PisosSource(),
  boe: () => new BoeSource(),
  solvia: () => new SolviaSource(),
};

export async function runWeeklySnapshot(
  opts: WeeklySnapshotOptions = {},
): Promise<WeeklySnapshotResult> {
  const sources = opts.sources ?? ['pisos', 'boe', 'solvia'];
  const maxPerSource = opts.maxPerSource ?? 50;
  const startedAt = new Date();
  const runs: OrchestratorResult[] = [];

  console.log(
    `\n[weekly-snapshot] start at ${startedAt.toISOString()} | sources=${sources.join(',')} | max=${maxPerSource}/source\n`,
  );

  for (const sourceName of sources) {
    const ctor = SOURCE_REGISTRY[sourceName];
    if (!ctor) {
      console.warn(`[weekly-snapshot] fuente desconocida: ${sourceName}, salto`);
      continue;
    }
    const source = ctor();
    try {
      const result = await runSource(source, {
        maxItems: maxPerSource,
        postalCodes: opts.postalCodes,
      });
      runs.push(result);
    } catch (err) {
      console.error(`[weekly-snapshot] ${sourceName} FATAL:`, err);
      // El runSource ya gestiona errores internos. Si llega aquí es algo más grave.
      // No paramos el job entero — la siguiente fuente puede tener éxito.
    }
  }

  // Enriquecer con Catastro (lat/lng oficiales para propiedades con ref catastral).
  let enrichCatastro: EnrichCatastroResult | undefined;
  if (opts.enrichCatastro !== false) {
    try {
      console.log('\n[weekly-snapshot] arrancando enricher Catastro...');
      enrichCatastro = await runEnrichCatastro({ maxItems: 5000 });
    } catch (err) {
      console.error('[weekly-snapshot] enrich-catastro FATAL:', err);
    }
  }

  // Evaluar zonas → crear alertas + enviar WhatsApp si aplica.
  let evaluateZones: EvaluateZonesResult | undefined;
  if (opts.evaluateZones !== false) {
    try {
      console.log('\n[weekly-snapshot] arrancando evaluator de zonas...');
      evaluateZones = await runEvaluateZones();
    } catch (err) {
      console.error('[weekly-snapshot] evaluate-zones FATAL:', err);
    }
  }

  // Detectar propiedades desaparecidas → alimenta mediana de absorción.
  let detectDisappeared: DetectDisappearedResult | undefined;
  if (opts.detectDisappeared !== false) {
    try {
      console.log('\n[weekly-snapshot] arrancando detect-disappeared...');
      detectDisappeared = await runDetectDisappeared();
      console.log(
        `[detect-disappeared] marcadas ${detectDisappeared.markedDisappeared} propiedades en ${detectDisappeared.processedSources} fuentes`,
      );
    } catch (err) {
      console.error('[weekly-snapshot] detect-disappeared FATAL:', err);
    }
  }

  // Análisis visual de fotos con Claude Vision (top N pendientes).
  let analyzePhotos: AnalyzePhotosResult | undefined;
  if (opts.analyzePhotos !== false && process.env['ANTHROPIC_API_KEY']) {
    try {
      console.log('\n[weekly-snapshot] arrancando analyze-photos (Claude Vision)...');
      analyzePhotos = await runAnalyzePhotos();
      console.log(
        `[analyze-photos] ${analyzePhotos.analyzed} analizadas, ${analyzePhotos.failed} fallos, coste ${analyzePhotos.totalCostEur}€`,
      );
    } catch (err) {
      console.error('[weekly-snapshot] analyze-photos FATAL:', err);
    }
  }

  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();

  const totals = runs.reduce(
    (acc, r) => ({
      propertiesFound: acc.propertiesFound + r.propertiesFound,
      propertiesNew: acc.propertiesNew + r.propertiesNew,
      propertiesUpdated: acc.propertiesUpdated + r.propertiesUpdated,
      errors: acc.errors + r.errors.length,
    }),
    { propertiesFound: 0, propertiesNew: 0, propertiesUpdated: 0, errors: 0 },
  );

  console.log(`\n[weekly-snapshot] done in ${(durationMs / 1000).toFixed(1)}s`);
  console.log('=== TOTALES ===');
  console.log(`  Found:   ${totals.propertiesFound}`);
  console.log(`  New:     ${totals.propertiesNew}`);
  console.log(`  Updated: ${totals.propertiesUpdated}`);
  console.log(`  Errores: ${totals.errors}`);
  if (enrichCatastro) {
    console.log(`  Geocoded (Catastro): ${enrichCatastro.enriched}/${enrichCatastro.attempted}`);
  }
  if (evaluateZones) {
    console.log(
      `  Zone alerts: ${evaluateZones.alertsCreated} created · ${evaluateZones.alertsSent} sent · ${evaluateZones.alertsSkipped} skipped · ${evaluateZones.alertsFailed} failed`,
    );
  }
  if (detectDisappeared) {
    console.log(
      `  Detect-disappeared: ${detectDisappeared.markedDisappeared} marcadas en ${detectDisappeared.processedSources} fuentes`,
    );
  }
  if (analyzePhotos) {
    console.log(
      `  Vision: ${analyzePhotos.analyzed} analizadas · ${analyzePhotos.failed} fallos · coste ${analyzePhotos.totalCostEur}€`,
    );
  }
  console.log('');

  return {
    startedAt,
    endedAt,
    durationMs,
    runs,
    enrichCatastro,
    evaluateZones,
    detectDisappeared,
    analyzePhotos,
    totals,
  };
}
