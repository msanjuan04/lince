// Smoke del query que alimenta /oportunidades/mapa.
// Reproduce exactamente lo que hace fetchOpportunitiesForMap del adaptador.

import { prisma } from '../src/index';

async function main(): Promise<void> {
  const withGeo = await prisma.property.findMany({
    where: { AND: [{ lat: { not: null } }, { lng: { not: null } }] },
    select: { id: true, source: true, address: true, lat: true, lng: true, postalCode: true },
    orderBy: { lastSeen: 'desc' },
  });

  const withoutGeo = await prisma.property.count({
    where: { OR: [{ lat: null }, { lng: null }] },
  });

  console.log(`\n=== SMOKE MAPA ===`);
  console.log(`Con coordenadas: ${withGeo.length}`);
  console.log(`Sin coordenadas: ${withoutGeo}`);
  console.log(`Total: ${withGeo.length + withoutGeo}\n`);

  console.log(`--- Primeras 10 con coordenadas ---`);
  for (const p of withGeo.slice(0, 10)) {
    console.log(`  [${p.source}] ${p.lat?.toFixed(4)},${p.lng?.toFixed(4)} — ${p.address}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
