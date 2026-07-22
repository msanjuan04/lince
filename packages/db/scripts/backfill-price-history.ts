// Backfill: para cada propiedad ya en DB sin punto inicial en price_history,
// inserta una fila baseline con oldPrice=null, newPrice=propiedad.price,
// observedAt=firstSeen. Una sola ejecución.

import { prisma, type Prisma } from '../src/index';

async function main(): Promise<void> {
  const properties = await prisma.property.findMany({
    where: { price: { not: null } },
    select: { id: true, price: true, firstSeen: true },
  });

  console.log(`Total propiedades con precio: ${properties.length}`);

  let inserted = 0;
  let skipped = 0;
  for (const p of properties) {
    const existing = await prisma.priceHistory.findFirst({
      where: { propertyId: p.id },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.priceHistory.create({
      data: {
        propertyId: p.id,
        oldPrice: null,
        newPrice: p.price as Prisma.Decimal,
        deltaPct: null,
        observedAt: p.firstSeen,
      },
    });
    inserted += 1;
  }

  console.log(`Insertadas baseline: ${inserted}`);
  console.log(`Ya tenían histórico: ${skipped}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
