'use server';

import { revalidatePath } from 'next/cache';
import { prisma, pulseReportsRepo, weekStartUTC } from '@lince/db';
import { generatePulseReport, loadPulseData } from '@lince/ai';
import type { PulseReaderRole } from '@lince/ai';
import { DEMO_AGENCY_ID } from '@/lib/data/mocks/agency';

export interface GenerateReportResult {
  ok: boolean;
  reportId?: string;
  costEur?: number;
  tokensIn?: number;
  tokensOut?: number;
  dryRun: boolean;
  error?: string;
}

/**
 * Genera el informe semanal Pulse para la agency actual.
 *
 * - Si `ANTHROPIC_API_KEY` no está → dry run, persiste un report con
 *   `dryRun=true` y narrative placeholder (útil para probar UI sin gastar
 *   tokens).
 * - Si sí está → llama a Claude, persiste el markdown y los counters de uso.
 */
export async function generatePulseReportAction(input: {
  readerRole?: PulseReaderRole;
}): Promise<GenerateReportResult> {
  const readerRole = input.readerRole ?? 'inversor_directo';
  const agencyId = DEMO_AGENCY_ID;

  // 1) Cargar el dataset (mismo en dry-run y en real)
  const data = await loadPulseData({
    readerRole,
    topN: 10,
    weekEndDate: new Date(),
  }).catch((err) => {
    console.error('[generatePulseReportAction] loadPulseData falló:', err);
    return null;
  });

  if (!data) {
    return { ok: false, dryRun: true, error: 'No se pudo cargar el dataset de propiedades.' };
  }

  const inventorySnapshot = {
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
    readerRole: data.readerRole,
    propertyCount: data.properties.length,
    zoneCount: data.zoneStats.length,
    bucketCounts: {
      auction: data.properties.filter((p) => p.isAuction).length,
      bankOwned: data.properties.filter((p) => p.isBankOwned && !p.isAuction).length,
      portal: data.properties.filter((p) => !p.isAuction && !p.isBankOwned).length,
      needsReform: data.properties.filter((p) => p.condition === 'needs_reform').length,
      withRedFlags: data.properties.filter((p) => (p.redFlags?.length ?? 0) > 0).length,
    },
  };

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    // Dry run: persistimos sin llamar a Claude.
    const placeholder = buildDryRunNarrative(data);
    const report = await pulseReportsRepo.upsertPulseReport({
      agencyId,
      weekOf: weekStartUTC(new Date()),
      narrative: placeholder,
      topOpportunities: data.properties.slice(0, 5).map((p) => ({
        propertyId: p.id,
        address: p.address,
        city: p.city,
        postalCode: p.postalCode,
        price: p.price,
        pricePerM2: p.pricePerM2,
        zoneAvgPricePerM2: p.zoneAvgPricePerM2,
        opportunityScore: p.opportunityScore,
        bucket: p.isAuction ? 'auction' : p.isBankOwned ? 'bank_owned' : 'portal',
      })),
      inventorySnapshot,
      modelId: 'dry-run',
      promptVersion: 'v1',
      tokensIn: null,
      tokensOut: null,
      costEur: null,
      dryRun: true,
    });
    revalidatePath('/informe');
    return { ok: true, reportId: report.id, dryRun: true };
  }

  // 2) Llamar a Claude real
  try {
    const result = await generatePulseReport(data, { apiKey, model: 'claude-opus-4-7' });

    // Coste aproximado (Opus 4.7 ~ $15/1M input, $75/1M output, asumir EUR≈USD)
    const inputCost = (result.usage.inputTokens * 15) / 1_000_000;
    const outputCost = (result.usage.outputTokens * 75) / 1_000_000;
    const cacheReadCost = (result.usage.cacheReadInputTokens * 1.5) / 1_000_000; // 10% del input cost
    const costEur = +(inputCost + outputCost + cacheReadCost).toFixed(4);

    const report = await pulseReportsRepo.upsertPulseReport({
      agencyId,
      weekOf: weekStartUTC(new Date()),
      narrative: result.markdown,
      topOpportunities: data.properties.slice(0, 5).map((p) => ({
        propertyId: p.id,
        address: p.address,
        city: p.city,
        postalCode: p.postalCode,
        price: p.price,
        pricePerM2: p.pricePerM2,
        zoneAvgPricePerM2: p.zoneAvgPricePerM2,
        opportunityScore: p.opportunityScore,
        bucket: p.isAuction ? 'auction' : p.isBankOwned ? 'bank_owned' : 'portal',
      })),
      inventorySnapshot,
      modelId: result.model,
      promptVersion: 'v1',
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costEur,
      dryRun: false,
    });
    revalidatePath('/informe');
    return {
      ok: true,
      reportId: report.id,
      costEur,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      dryRun: false,
    };
  } catch (err) {
    console.error('[generatePulseReportAction] Claude llamada falló:', err);
    return {
      ok: false,
      dryRun: false,
      error: err instanceof Error ? err.message : 'Error desconocido llamando a Claude',
    };
  }
}

function buildDryRunNarrative(data: Awaited<ReturnType<typeof loadPulseData>>): string {
  const top = data.properties.slice(0, 3);
  return `# Informe Pulse — modo DRY-RUN (sin Claude)

> Este informe se ha generado sin llamar a Claude porque \`ANTHROPIC_API_KEY\`
> no está en el entorno. Los datos son reales, pero falta el análisis narrado.
> Configura la API key y regenera para el informe completo.

## Resumen ejecutivo

${top
  .map(
    (p) =>
      `- **${p.address ?? 'Sin dirección'}, ${p.postalCode ?? '?'} ${p.city ?? ''}** — Score ${p.opportunityScore ?? 'N/A'}/100, precio ${p.price?.toLocaleString('es-ES') ?? '?'}€`,
  )
  .join('\n')}

## Inventario analizado

- ${data.properties.length} propiedades en el dataset
- ${data.zoneStats.length} zonas con muestra
- Periodo: ${data.weekStart} → ${data.weekEnd}
- Rol del lector: ${data.readerRole}
`;
}
