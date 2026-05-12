// Verifica el estado de la DB tras la Fase 1: conteos por fuente, distribución
// de campos críticos (precio rellenado, CP rellenado, condition detectado,
// banderas rojas) y muestra de filas.

import { prisma, Prisma } from '../src/index.js';

async function main(): Promise<void> {
  console.log('\n========== VERIFICACIÓN FASE 1 ==========\n');

  const runs = await prisma.crawlerRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5,
  });
  console.log(`-- Runs de crawler (últimos 5) --`);
  for (const r of runs) {
    console.log(
      `  ${r.source.padEnd(8)} status=${r.status?.padEnd(7) ?? 'n/a    '} found=${String(r.propertiesFound ?? 0).padStart(3)} new=${String(r.propertiesNew ?? 0).padStart(3)} updated=${String(r.propertiesUpdated ?? 0).padStart(3)} dur=${r.endedAt && r.startedAt ? Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 1000) : '?'}s  id=${r.id.slice(0, 8)}`,
    );
  }

  const total = await prisma.property.count();
  console.log(`\n-- Properties totales: ${total} --`);

  // Distribución por fuente
  const bySource = await prisma.$queryRaw<Array<{ source: string; n: bigint }>>(
    Prisma.sql`SELECT source, COUNT(*)::bigint AS n FROM properties GROUP BY source ORDER BY n DESC`,
  );
  for (const row of bySource) {
    console.log(`  ${row.source.padEnd(8)} ${row.n.toString().padStart(3)} propiedades`);
  }

  // Calidad de datos: % de campos rellenos
  console.log(`\n-- Calidad de datos (cobertura por campo) --`);
  const fields = [
    'price',
    'm2',
    'rooms',
    'postal_code',
    'address',
    'city',
    'type',
    'condition',
    'description',
  ] as const;
  for (const field of fields) {
    const filled = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM properties WHERE "${field}" IS NOT NULL`,
    );
    const n = Number(filled[0]?.n ?? 0n);
    const pct = total === 0 ? 0 : Math.round((n / total) * 100);
    console.log(`  ${field.padEnd(14)} ${String(n).padStart(3)}/${total} (${pct}%)`);
  }

  // Buckets potenciales
  console.log(`\n-- Buckets detectables ahora (sin agente Pulse aún) --`);
  const auctions = await prisma.property.count({ where: { isAuction: true } });
  const bankOwned = await prisma.property.count({ where: { isBankOwned: true } });
  const needsReform = await prisma.property.count({ where: { condition: 'needs_reform' } });
  const withTerrace = await prisma.property.count({ where: { hasTerrace: true } });
  const withRedFlags = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::bigint AS n FROM properties WHERE array_length(red_flags, 1) > 0`,
  );
  console.log(`  Subastas (Bucket B):        ${auctions}`);
  console.log(`  Bank-owned (Bucket B):      ${bankOwned}`);
  console.log(`  Necesita reforma (C):       ${needsReform}`);
  console.log(`  Con terraza (E):            ${withTerrace}`);
  console.log(`  Con banderas rojas:         ${Number(withRedFlags[0]?.n ?? 0n)}`);

  // Top 5 propiedades más baratas por €/m² (ya proto-Pulse)
  console.log(`\n-- Top 5 por €/m² más bajo (con datos completos) --`);
  const cheapest = await prisma.property.findMany({
    where: {
      pricePerM2: { not: null },
      m2: { not: null },
      postalCode: { not: null },
      price: { gt: 50000 }, // descartar trasteros/garajes BOE
    },
    orderBy: { pricePerM2: 'asc' },
    take: 5,
    select: {
      source: true,
      type: true,
      city: true,
      postalCode: true,
      m2: true,
      price: true,
      pricePerM2: true,
      condition: true,
      address: true,
    },
  });
  for (const p of cheapest) {
    console.log(
      `  [${p.source}] ${(p.type ?? '?').padEnd(8)} ${p.city ?? '?'} CP${p.postalCode} ${p.m2}m² ${p.price?.toFixed(0)}€ → ${p.pricePerM2?.toFixed(0)}€/m²  cond=${p.condition ?? 'unknown'}`,
    );
    console.log(`      ${p.address}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
