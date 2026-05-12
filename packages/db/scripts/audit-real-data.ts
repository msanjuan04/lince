// Auditoría de honestidad de datos: reporta cuántas propiedades tienen cada
// campo crítico relleno vs null, y muestra un ejemplo de cada estado.

import { prisma } from '../src/index';

async function main(): Promise<void> {
  const total = await prisma.property.count();
  console.log(`\n=== AUDITORÍA DE HONESTIDAD (${total} propiedades) ===\n`);

  const checks: Array<{ name: string; where: object }> = [
    { name: 'address', where: { address: { not: null } } },
    { name: 'city', where: { city: { not: null } } },
    { name: 'postalCode', where: { postalCode: { not: null } } },
    { name: 'lat & lng', where: { AND: [{ lat: { not: null } }, { lng: { not: null } }] } },
    { name: 'm2', where: { m2: { not: null } } },
    { name: 'rooms', where: { rooms: { not: null } } },
    { name: 'price', where: { price: { not: null } } },
    { name: 'pricePerM2', where: { pricePerM2: { not: null } } },
    { name: 'description', where: { description: { not: null } } },
    { name: 'type', where: { type: { not: null } } },
    { name: 'cadastralRef', where: { cadastralRef: { not: null } } },
    { name: 'sourceUrl', where: { sourceUrl: { not: null } } },
  ];

  for (const c of checks) {
    const count = await prisma.property.count({ where: c.where });
    const pct = total === 0 ? 0 : Math.round((count / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)).padEnd(20, '░');
    console.log(`  ${c.name.padEnd(14)} ${bar} ${String(count).padStart(3)}/${total} (${pct}%)`);
  }

  // Zone sample distribution
  const zoneStats = await prisma.$queryRawUnsafe<Array<{ postal_code: string; n: bigint }>>(
    `SELECT postal_code, COUNT(*)::bigint AS n
     FROM properties
     WHERE postal_code IS NOT NULL AND price_per_m2 IS NOT NULL AND is_auction = false
     GROUP BY postal_code
     ORDER BY n DESC`,
  );
  console.log(`\n--- CPs con muestra (excluyendo subastas) ---`);
  for (const r of zoneStats) {
    const n = Number(r.n);
    const tier = n >= 3 ? '✓ score' : '✗ insuficiente';
    console.log(`  ${r.postal_code}: ${n} propiedades  ${tier}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
