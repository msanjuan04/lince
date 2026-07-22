// Actualiza maxPrice de zonas urbanas a niveles realistas de mercado.
// Mantiene el resto de filtros intactos (solo toca filters.maxPrice).
//
// Ejecución idempotente — si ya tiene el valor nuevo, no cambia nada.

import { prisma } from '../src/index';

interface MaxPriceUpdate {
  nameContains: string;
  newMaxPrice: number;
}

const UPDATES: MaxPriceUpdate[] = [
  { nameContains: 'Sabadell', newMaxPrice: 280_000 },
  { nameContains: "L'Hospitalet", newMaxPrice: 350_000 },
  { nameContains: 'BCN', newMaxPrice: 400_000 },
  { nameContains: 'Cornellà', newMaxPrice: 270_000 },
  { nameContains: 'Maresme alto', newMaxPrice: 400_000 },
  { nameContains: 'Badalona', newMaxPrice: 400_000 },
  { nameContains: 'Costa Brava turismo', newMaxPrice: 270_000 },
];

async function main(): Promise<void> {
  const zones = await prisma.zone.findMany();
  let changed = 0;
  let unchanged = 0;

  for (const u of UPDATES) {
    const matches = zones.filter((z) => (z.name ?? '').includes(u.nameContains));
    if (matches.length === 0) {
      console.log(`  ⚠️  Sin match para "${u.nameContains}"`);
      continue;
    }
    if (matches.length > 1) {
      console.log(
        `  ⚠️  ${matches.length} matches para "${u.nameContains}" — saltando por seguridad`,
      );
      continue;
    }
    const zone = matches[0];
    const currentFilters = (zone.filters ?? {}) as Record<string, unknown>;
    const currentMax = currentFilters.maxPrice;
    if (currentMax === u.newMaxPrice) {
      console.log(`  ✓  "${zone.name}" ya está a ${u.newMaxPrice} €`);
      unchanged += 1;
      continue;
    }
    const newFilters = { ...currentFilters, maxPrice: u.newMaxPrice };
    await prisma.zone.update({
      where: { id: zone.id },
      data: { filters: newFilters },
    });
    console.log(`  ✅ "${zone.name}": ${currentMax} € → ${u.newMaxPrice} €`);
    changed += 1;
  }

  console.log(`\nDone. Cambiadas: ${changed} · Sin cambios: ${unchanged}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
