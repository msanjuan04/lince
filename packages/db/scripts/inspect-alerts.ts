// Inspecciona las zone_alerts creadas: agrupa por trigger/status y muestra
// muestra. Útil para verificar que el evaluator funcionó.

import { prisma } from '../src/index';

async function main(): Promise<void> {
  const total = await prisma.zoneAlert.count();
  console.log(`\n=== ZONE ALERTS (total ${total}) ===\n`);

  const byStatus = await prisma.$queryRawUnsafe<Array<{ status: string; n: bigint }>>(
    `SELECT status, COUNT(*)::bigint AS n FROM zone_alerts GROUP BY status ORDER BY n DESC`,
  );
  console.log('--- por status ---');
  for (const r of byStatus) console.log(`  ${r.status}: ${r.n}`);

  const byTrigger = await prisma.$queryRawUnsafe<Array<{ trigger: string; n: bigint }>>(
    `SELECT trigger, COUNT(*)::bigint AS n FROM zone_alerts GROUP BY trigger ORDER BY n DESC`,
  );
  console.log('\n--- por trigger ---');
  for (const r of byTrigger) console.log(`  ${r.trigger}: ${r.n}`);

  const sample = await prisma.zoneAlert.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { zone: true },
  });
  console.log('\n--- muestra ---');
  for (const a of sample) {
    console.log(
      `  zone="${a.zone.name}" trigger=${a.trigger} channel=${a.channel} status=${a.status} error="${a.error ?? '—'}"`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
