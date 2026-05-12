// Smoke test del histórico: baja artificialmente el precio de la primera
// propiedad pisos.com en DB, vuelve a aplicar la lógica de upsert simulando
// que el crawler trae el precio original, y verifica que se inserta una
// fila en price_history.

import { prisma, propertiesRepo, Prisma } from '../src/index';

async function main(): Promise<void> {
  // 1. Coger primera propiedad de Pisos.com
  const target = await prisma.property.findFirst({
    where: { source: 'pisos', price: { not: null } },
    select: { id: true, source: true, sourceId: true, sourceUrl: true, price: true, address: true },
  });
  if (!target || !target.price) {
    console.log('No hay propiedad de pisos con precio. Aborto.');
    return;
  }

  const originalPrice = Number(target.price);
  const fakeOldPrice = originalPrice + 25_000; // simulamos que ANTES costaba 25k más

  console.log(`Propiedad: ${target.address}`);
  console.log(`  Precio actual en DB: ${originalPrice} €`);
  console.log(`  Simulamos que en el run anterior costaba: ${fakeOldPrice} €`);
  console.log(
    `  → Una rebaja de ${originalPrice - fakeOldPrice} € (${(((originalPrice - fakeOldPrice) / fakeOldPrice) * 100).toFixed(2)}%)`,
  );
  console.log();

  // 2. Backdate la propiedad: cambia el precio en DB al fake "antes"
  await prisma.property.update({
    where: { id: target.id },
    data: { price: new Prisma.Decimal(fakeOldPrice) },
  });
  console.log('Step 1: precio en DB cambiado a fakeOldPrice');

  // 3. Borra el baseline existente de price_history para esta propiedad
  // (porque se hizo backfill con el precio fake, NO el real)
  await prisma.priceHistory.deleteMany({ where: { propertyId: target.id } });
  await prisma.priceHistory.create({
    data: {
      propertyId: target.id,
      oldPrice: null,
      newPrice: new Prisma.Decimal(fakeOldPrice),
      deltaPct: null,
      observedAt: new Date(Date.now() - 7 * 86_400_000), // hace una semana
    },
  });
  console.log('Step 2: baseline reescrito con fakeOldPrice de hace 7 días');

  // 4. Ahora simulamos un nuevo run del crawler con el precio "real" → upsert
  await propertiesRepo.upsertProperty({
    source: target.source,
    sourceId: target.sourceId,
    sourceUrl: target.sourceUrl,
    price: originalPrice,
    // resto de campos no tocan al diff de precio
  });
  console.log('Step 3: upsertProperty llamado con precio nuevo (originalPrice)');

  // 5. Verifica
  const history = await prisma.priceHistory.findMany({
    where: { propertyId: target.id },
    orderBy: { observedAt: 'asc' },
  });
  console.log();
  console.log('Histórico resultante:');
  for (const h of history) {
    const old = h.oldPrice ? Number(h.oldPrice) : null;
    const nw = Number(h.newPrice);
    const delta = h.deltaPct ? Number(h.deltaPct) : null;
    console.log(
      `  ${h.observedAt.toISOString().slice(0, 16)}  oldPrice=${old ?? 'null'}  newPrice=${nw}  delta=${delta !== null ? delta + '%' : '—'}`,
    );
  }

  if (history.length < 2) {
    console.error('\n❌ FAIL: esperaba 2 filas (baseline + diff), encontré', history.length);
    process.exit(1);
  }
  console.log('\n✅ Histórico funcionando.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
