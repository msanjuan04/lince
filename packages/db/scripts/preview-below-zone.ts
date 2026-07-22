// Preview READ-ONLY: cuántas propiedades del área metro cumplen el filtro
// "€/m² al menos MIN_BELOW por debajo de la mediana €/m² de su zona".
// No escribe nada, no envía nada. Sirve para dimensionar antes de activar la zona.

import { prisma } from '../src/index';
import { getAllUniversePostalCodes } from '../src/data/market-reference-2026Q2';

const MIN_BELOW = Number(process.env['MIN_BELOW_ZONE_PCT'] ?? '0.20');
const MIN_EUR_M2 = Number(process.env['MIN_EUR_M2_FLOOR'] ?? '500');
const MAX_M2 = Number(process.env['MAX_M2_SANITY'] ?? '600');

// CPs área metro = universo (AMB + Maresme + Vallès) + Granollers + Manresa + Terrassa completo.
const GRANOLLERS = ['08400', '08401', '08402', '08403'];
const MANRESA = ['08240', '08241', '08242', '08243'];
const TERRASSA_EXTRA = ['08223', '08224', '08225', '08227', '08228'];
const METRO_CPS = Array.from(
  new Set([...getAllUniversePostalCodes(), ...GRANOLLERS, ...MANRESA, ...TERRASSA_EXTRA]),
);

async function main(): Promise<void> {
  console.log(
    `Área metro: ${METRO_CPS.length} CPs | umbral: ${(MIN_BELOW * 100).toFixed(0)}% bajo €/m² zona`,
  );

  const props = await prisma.property.findMany({
    where: {
      postalCode: { in: METRO_CPS },
      pricePerM2: { not: null },
      zoneAvgPricePerM2: { not: null },
    },
    select: {
      id: true,
      source: true,
      city: true,
      postalCode: true,
      price: true,
      m2: true,
      pricePerM2: true,
      zoneAvgPricePerM2: true,
      firstSeen: true,
      sourceUrl: true,
    },
  });

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const matches = props
    .map((p) => {
      const eur = Number(p.pricePerM2);
      const zone = Number(p.zoneAvgPricePerM2);
      const belowPct = zone > 0 ? (zone - eur) / zone : 0;
      return { ...p, eur, zone, belowPct };
    })
    .filter((p) => p.belowPct >= MIN_BELOW)
    // Guarda de cordura: descarta parcelas/edificios mal etiquetados.
    .filter((p) => p.eur >= MIN_EUR_M2 && (p.m2 == null || p.m2 <= MAX_M2))
    .sort((a, b) => b.belowPct - a.belowPct);

  const newIn7d = matches.filter((p) => p.firstSeen && p.firstSeen.getTime() >= sevenDaysAgo);

  console.log(`\nCon €/m² y €/m² de zona: ${props.length} propiedades en el área metro`);
  console.log(`Cumplen el filtro (≥${(MIN_BELOW * 100).toFixed(0)}% bajo zona): ${matches.length}`);
  console.log(`  → de esas, nuevas en 7 días (alertarían como new_property): ${newIn7d.length}`);

  const bySource: Record<string, number> = {};
  for (const m of matches) bySource[m.source] = (bySource[m.source] ?? 0) + 1;
  console.log(`\nPor fuente (todas las que cumplen):`, JSON.stringify(bySource));

  console.log(`\n=== Top 10 por descuento vs zona ===`);
  for (const m of matches.slice(0, 10)) {
    console.log(
      `  ${(m.belowPct * 100).toFixed(0)}% bajo | ${m.eur.toFixed(0)}€/m² vs ${m.zone.toFixed(0)} zona | ${m.city ?? '?'} ${m.postalCode} | ${Number(m.price).toLocaleString('es-ES')}€ ${m.m2 ?? '?'}m² | ${m.source}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
