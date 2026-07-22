// Script temporal de diagnóstico — ver zonas, fuentes y CPs en DB
import { prisma } from '../src/index';

async function main(): Promise<void> {
  const zones = await prisma.zone.findMany({
    select: {
      id: true,
      name: true,
      postalCodes: true,
      alertChannels: true,
      active: true,
      filters: true,
    },
  });
  console.log('=== ZONAS ===');
  for (const z of zones) {
    console.log(
      `  ${z.active ? '✅' : '❌'} "${z.name}" | CPs: [${z.postalCodes.join(', ')}] | canales: [${z.alertChannels.join(', ')}] | filtros: ${JSON.stringify(z.filters)}`,
    );
  }

  const sources = await prisma.property.groupBy({ by: ['source'], _count: { id: true } });
  console.log('\n=== PROPIEDADES POR FUENTE ===');
  for (const s of sources) console.log(`  ${s.source}: ${s._count.id}`);

  const cps = await prisma.property.groupBy({
    by: ['postalCode'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 15,
  });
  console.log('\n=== TOP 15 CPs EN DB ===');
  for (const c of cps) console.log(`  ${c.postalCode ?? 'null'}: ${c._count.id} props`);

  const recent = await prisma.property.findMany({
    where: { firstSeen: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    select: { source: true, postalCode: true, firstSeen: true },
    orderBy: { firstSeen: 'desc' },
    take: 10,
  });
  console.log('\n=== ÚLTIMAS 10 PROPIEDADES (7 días) ===');
  for (const p of recent)
    console.log(`  ${p.source} | CP ${p.postalCode} | ${p.firstSeen?.toISOString().slice(0, 10)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
