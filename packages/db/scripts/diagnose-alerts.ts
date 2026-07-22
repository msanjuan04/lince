// Diagnóstico READ-ONLY: por qué salen tan pocas alertas y de dónde.
import { prisma } from '../src/index';
import { getAllUniversePostalCodes } from '../src/data/market-reference-2026Q2';

const GRANOLLERS = ['08400', '08401', '08402', '08403'];
const MANRESA = ['08240', '08241', '08242', '08243'];
const TERRASSA_EXTRA = ['08223', '08224', '08225', '08227', '08228'];
const METRO_CPS = Array.from(
  new Set([...getAllUniversePostalCodes(), ...GRANOLLERS, ...MANRESA, ...TERRASSA_EXTRA]),
);

async function main(): Promise<void> {
  // 1) Alertas de las últimas 3h por status + motivo (error).
  const since = new Date(Date.now() - 3 * 3_600_000);
  const recent = await prisma.zoneAlert.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, error: true, trigger: true, propertyId: true, sentAt: true },
  });
  console.log(`=== Alertas creadas últimas 3h: ${recent.length} ===`);
  const byStatus: Record<string, number> = {};
  for (const a of recent) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  console.log('por status:', JSON.stringify(byStatus));

  const skipReasons: Record<string, number> = {};
  for (const a of recent.filter((r) => r.status === 'skipped')) {
    // Normaliza el motivo (quita números concretos) para agrupar.
    const key = (a.error ?? 'sin motivo').replace(/\d+/g, 'N');
    skipReasons[key] = (skipReasons[key] ?? 0) + 1;
  }
  console.log('\n=== Motivos de skip (agrupados) ===');
  for (const [k, v] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}×  ${k}`);
  }

  // 2) Las enviadas: fuente + ¿repetida? (alertada antes bajo otra zona)
  const sent = recent.filter((r) => r.status === 'sent');
  console.log(`\n=== Enviadas (${sent.length}) ===`);
  for (const a of sent) {
    const prop = await prisma.property.findUnique({
      where: { id: a.propertyId },
      select: { source: true, city: true, postalCode: true, firstSeen: true },
    });
    const priorCount = await prisma.zoneAlert.count({
      where: { propertyId: a.propertyId, status: 'sent' },
    });
    console.log(
      `  ${prop?.source} | ${prop?.city} ${prop?.postalCode} | firstSeen ${prop?.firstSeen?.toISOString().slice(0, 10)} | veces enviada (histórico): ${priorCount}`,
    );
  }

  // 3) Cobertura de datos en el área metro (activas).
  const total = await prisma.property.count({ where: { postalCode: { in: METRO_CPS } } });
  const withEurM2 = await prisma.property.count({
    where: { postalCode: { in: METRO_CPS }, pricePerM2: { not: null } },
  });
  const withZoneAvg = await prisma.property.count({
    where: { postalCode: { in: METRO_CPS }, zoneAvgPricePerM2: { not: null } },
  });
  const withScore = await prisma.property.count({
    where: { postalCode: { in: METRO_CPS }, opportunityScore: { not: null } },
  });
  console.log(`\n=== Cobertura de datos área metro (${METRO_CPS.length} CPs) ===`);
  console.log(`  propiedades totales: ${total}`);
  console.log(`  con €/m² (pricePerM2): ${withEurM2}`);
  console.log(`  con €/m² de ZONA (zoneAvgPricePerM2): ${withZoneAvg}  ← clave para el filtro`);
  console.log(`  con opportunityScore: ${withScore}`);

  // 4) De las que SÍ tienen zona: cuántas ≥20% bajo, por fuente.
  const cand = await prisma.property.findMany({
    where: {
      postalCode: { in: METRO_CPS },
      pricePerM2: { not: null },
      zoneAvgPricePerM2: { not: null },
    },
    select: { source: true, pricePerM2: true, zoneAvgPricePerM2: true, m2: true, firstSeen: true },
  });
  const below = cand.filter((p) => {
    const e = Number(p.pricePerM2);
    const z = Number(p.zoneAvgPricePerM2);
    return z > 0 && (z - e) / z >= 0.2 && e >= 500 && (p.m2 == null || p.m2 <= 600);
  });
  const bySource: Record<string, number> = {};
  for (const p of below) bySource[p.source] = (bySource[p.source] ?? 0) + 1;
  console.log(
    `\n=== Chollos ≥20% bajo zona + cordura (TODAS, no solo nuevas): ${below.length} ===`,
  );
  console.log('  por fuente:', JSON.stringify(bySource));
  const newBelow = below.filter(
    (p) => p.firstSeen && p.firstSeen.getTime() >= Date.now() - 7 * 86_400_000,
  );
  console.log(`  de esas, nuevas en 7 días: ${newBelow.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
