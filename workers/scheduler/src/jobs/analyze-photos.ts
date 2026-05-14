// Job: analiza con Claude Vision la foto principal de las propiedades top
// pendientes de análisis. Una llamada por propiedad, secuencial (rate-limit
// implícito).
//
// Configuración (env):
//   PHOTO_ANALYSIS_BATCH_SIZE — propiedades por ejecución (default 10)
//   PHOTO_ANALYSIS_MIN_SCORE — solo analiza props con opportunityScore >= X (default 50)
//   PHOTO_ANALYSIS_MODEL — modelo Claude (default 'claude-sonnet-4-5')
//
// Coste estimado: ~0,01-0,02€ por foto. Con batch 10 = 0,10-0,20€/día.

import { crawlerRunsRepo, visualAnalysesRepo } from '@lince/db';
import { analyzePropertyPhoto } from '@lince/ai';

export interface AnalyzePhotosResult {
  runId: string;
  status: 'ok' | 'partial' | 'error';
  analyzed: number;
  failed: number;
  totalCostEur: number;
  durationMs: number;
  errors: Array<{ propertyId: string; message: string }>;
}

export async function runAnalyzePhotos(): Promise<AnalyzePhotosResult> {
  const run = await crawlerRunsRepo.startCrawlerRun('analyze-photos');
  const batchSize = Number.parseInt(process.env['PHOTO_ANALYSIS_BATCH_SIZE'] ?? '10', 10);
  const minScore = Number.parseInt(process.env['PHOTO_ANALYSIS_MIN_SCORE'] ?? '50', 10);
  const model = process.env['PHOTO_ANALYSIS_MODEL'] ?? 'claude-sonnet-4-5';

  let analyzed = 0;
  let failed = 0;
  let totalCostEur = 0;
  const errors: Array<{ propertyId: string; message: string }> = [];

  try {
    const candidates = await visualAnalysesRepo.getPropertiesPendingAnalysis({
      limit: isNaN(batchSize) ? 10 : batchSize,
      minScore: isNaN(minScore) ? undefined : minScore,
    });

    console.log(
      `[analyze-photos] ${candidates.length} propiedades a analizar (min_score=${minScore}, model=${model})`,
    );

    for (const property of candidates) {
      try {
        const result = await analyzePropertyPhoto(
          {
            imageUrl: property.mainImageUrl,
            context: {
              postalCode: property.postalCode ?? undefined,
              m2: property.m2 ?? undefined,
              yearBuilt: property.yearBuilt ?? undefined,
              sourceLabel: property.source,
            },
          },
          { model },
        );

        await visualAnalysesRepo.createVisualAnalysis({
          propertyId: property.id,
          imageUrl: property.mainImageUrl,
          modelId: result.model,
          promptVersion: result.promptVersion,
          conditionScore: result.analysis.conditionScore,
          conditionLabel: result.analysis.conditionLabel,
          reformCostPerM2: result.analysis.reformCostPerM2,
          elementsToReform: result.analysis.elementsToReform,
          visualRedFlags: result.analysis.visualRedFlags,
          photoQuality: result.analysis.photoQuality,
          summary: result.analysis.summary,
          rawResponse: result.analysis,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costEur: result.estimatedCostEur,
        });

        analyzed += 1;
        totalCostEur += result.estimatedCostEur;
        console.log(
          `[analyze-photos]   ✓ ${property.id.slice(0, 8)} cond=${result.analysis.conditionLabel} reforma=${result.analysis.reformCostPerM2 ?? 'n/a'}€/m² cost=${result.estimatedCostEur}€`,
        );
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ propertyId: property.id, message });
        console.error(`[analyze-photos]   ✗ ${property.id.slice(0, 8)}: ${message}`);
      }
    }

    const status: AnalyzePhotosResult['status'] =
      failed === 0 ? 'ok' : analyzed > 0 ? 'partial' : 'error';

    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status,
      propertiesFound: candidates.length,
      propertiesNew: analyzed,
      propertiesUpdated: 0,
      errors: errors.map((e) => ({
        message: `${e.propertyId}: ${e.message}`,
        at: new Date().toISOString(),
      })),
    });

    return {
      runId: run.id,
      status,
      analyzed,
      failed,
      totalCostEur: Math.round(totalCostEur * 10000) / 10000,
      durationMs: Date.now() - run.startedAt.getTime(),
      errors,
    };
  } catch (err) {
    await crawlerRunsRepo.finishCrawlerRun(run.id, {
      status: 'error',
      propertiesFound: 0,
      propertiesNew: analyzed,
      propertiesUpdated: 0,
      errors: [
        {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          at: new Date().toISOString(),
        },
      ],
    });
    return {
      runId: run.id,
      status: 'error',
      analyzed,
      failed,
      totalCostEur,
      durationMs: Date.now() - run.startedAt.getTime(),
      errors,
    };
  }
}
