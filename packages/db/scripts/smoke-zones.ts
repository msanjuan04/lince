// Smoke test de Fase 3: crea (o reusa) una zona de prueba, ejecuta el
// evaluator y muestra qué alertas se generaron.

import { prisma, zonesRepo } from '../src/index';

async function main(): Promise<void> {
  // 1) Asegurar agency demo (UUID fijo para evitar drift con apps/web/mocks)
  const agencyId = '00000000-0000-0000-0000-000000000001';
  const agency = await prisma.agency.upsert({
    where: { id: agencyId },
    update: {},
    create: {
      id: agencyId,
      name: 'Lince (desarrollo)',
      plan: 'founder',
      active: true,
    },
  });
  console.log(`Agency: ${agency.name} (${agency.id})`);

  // 2) Asegurar zona test BCN 08019 (donde tenemos 20 propiedades Solvia)
  const zones = await zonesRepo.listZonesForAgency(agency.id);
  let zone = zones.find((z) => z.name === 'Smoke BCN 08019');
  if (!zone) {
    const created = await zonesRepo.createZone({
      agencyId: agency.id,
      name: 'Smoke BCN 08019',
      postalCodes: ['08019'],
      filters: { maxPrice: 500_000 },
      alertChannels: ['whatsapp'],
      alertPhoneE164: null, // sin tlf → todas las alertas saldrán como 'skipped'
    });
    zone = await zonesRepo.getZoneById(created.id);
    console.log('Zona creada:', created.id);
  } else {
    console.log('Zona ya existente:', zone.id);
  }
  if (!zone) {
    console.error('No se pudo crear la zona');
    return;
  }

  // 3) Matching directo
  const matchingAll = await zonesRepo.findMatchingPropertyIds(zone.id);
  const matchingNew = await zonesRepo.findMatchingPropertyIds(
    zone.id,
    new Date(Date.now() - 7 * 86_400_000),
  );
  const drops = await zonesRepo.findPriceDropMatches(zone.id, 14, 0.05);

  console.log(`\n=== Matches en zona "${zone.name}" ===`);
  console.log(`  Total:           ${matchingAll.length}`);
  console.log(`  Nuevos (<7d):    ${matchingNew.length}`);
  console.log(`  Con rebaja ≥5%:  ${drops.length}`);

  // 4) Mostrar las primeras
  if (matchingAll.length > 0) {
    const sample = await prisma.property.findMany({
      where: { id: { in: matchingAll.slice(0, 5) } },
      select: { address: true, price: true, source: true },
    });
    console.log(`\n--- Muestra ---`);
    for (const p of sample) {
      console.log(`  [${p.source}] ${p.address} — ${p.price}€`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
