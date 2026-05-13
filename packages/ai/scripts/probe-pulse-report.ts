// Smoke directo del agente Pulse — carga datos, llama a Claude, persiste.
// Útil para validar la integración sin pasar por la UI.

import { generatePulseReport, loadPulseData } from '../src/index';
import { Prisma, prisma, weekStartUTC } from '@lince/db';

const AGENCY_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  console.log('\n=== Smoke informe Pulse ===\n');

  const data = await loadPulseData({
    readerRole: 'inversor_directo',
    topN: 10,
    weekEndDate: new Date(),
  });
  console.log(
    `Dataset cargado: ${data.properties.length} propiedades, ${data.zoneStats.length} zonas`,
  );

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY no está en el entorno');
    process.exit(1);
  }

  console.log('Llamando a Claude (claude-opus-4-7)...');
  const t0 = Date.now();
  const result = await generatePulseReport(data, { apiKey, model: 'claude-opus-4-7' });
  const ms = Date.now() - t0;

  const inputCost = (result.usage.inputTokens * 15) / 1_000_000;
  const outputCost = (result.usage.outputTokens * 75) / 1_000_000;
  const costEur = inputCost + outputCost;

  console.log(`\n=== Respuesta de Claude (${(ms / 1000).toFixed(1)}s) ===`);
  console.log(`  Modelo:    ${result.model}`);
  console.log(`  Tokens IN: ${result.usage.inputTokens}`);
  console.log(`  Tokens OUT:${result.usage.outputTokens}`);
  console.log(`  Cache HIT: ${result.usage.cacheReadInputTokens}`);
  console.log(`  Coste est: ${costEur.toFixed(4)}€`);
  console.log(`\n--- Markdown (primeros 1500 chars) ---\n`);
  console.log(result.markdown.slice(0, 1500));
  console.log(`\n... (${result.markdown.length} chars total)`);

  console.log('\nPersistiendo en pulse_reports...');
  const week = weekStartUTC(new Date());
  const topOpps = data.properties.slice(0, 5).map((p) => ({
    propertyId: p.id,
    address: p.address,
    price: p.price,
    pricePerM2: p.pricePerM2,
    opportunityScore: p.opportunityScore,
  }));
  const report = await prisma.pulseReport.upsert({
    where: { agencyId_weekOf: { agencyId: AGENCY_ID, weekOf: week } },
    create: {
      agencyId: AGENCY_ID,
      weekOf: week,
      narrative: result.markdown,
      topOpportunities: topOpps as Prisma.InputJsonValue,
      modelId: result.model,
      promptVersion: 'v1',
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costEur: new Prisma.Decimal(costEur),
      dryRun: false,
    },
    update: {
      narrative: result.markdown,
      topOpportunities: topOpps as Prisma.InputJsonValue,
      modelId: result.model,
      promptVersion: 'v1',
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costEur: new Prisma.Decimal(costEur),
      dryRun: false,
    },
  });
  console.log(`✓ Persistido: ${report.id}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
