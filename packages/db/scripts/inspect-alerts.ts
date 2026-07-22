// Diagnóstico de alertas: qué se mandó, qué se skippeó, qué falló.
import { prisma } from '../src/index';

async function main(): Promise<void> {
  const since = new Date(Date.now() - 14 * 86_400_000);

  // 1. Resumen por status global (últimos 14 días)
  const byStatus = await prisma.zoneAlert.groupBy({
    by: ['status'],
    where: { createdAt: { gte: since } },
    _count: { id: true },
  });
  console.log('=== ALERTAS ÚLTIMOS 14 DÍAS (por status) ===');
  for (const s of byStatus) console.log(`  ${s.status}: ${s._count.id}`);

  // 2. Por zona — quién genera alertas y de qué tipo
  const allAlerts = await prisma.zoneAlert.findMany({
    where: { createdAt: { gte: since } },
    include: {
      zone: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const propIds = Array.from(new Set(allAlerts.map((a) => a.propertyId)));
  const props = await prisma.property.findMany({
    where: { id: { in: propIds } },
    select: { id: true, source: true, postalCode: true, price: true },
  });
  const propMap = new Map(props.map((p) => [p.id, p]));

  console.log('\n=== ALERTAS POR ZONA + STATUS + FUENTE ===');
  const byZoneStatusSource = new Map<string, number>();
  for (const a of allAlerts) {
    const p = propMap.get(a.propertyId);
    const key = `${a.zone.name} | ${a.status} | ${p?.source ?? '?'} | ${a.trigger}`;
    byZoneStatusSource.set(key, (byZoneStatusSource.get(key) ?? 0) + 1);
  }
  const sorted = [...byZoneStatusSource.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) console.log(`  ${v.toString().padStart(3)}  ${k}`);

  // 3. Top razones de skip
  console.log('\n=== TOP 10 RAZONES DE SKIP ===');
  const skips = await prisma.zoneAlert.findMany({
    where: { status: 'skipped', createdAt: { gte: since } },
    select: { error: true },
  });
  const reasonCount = new Map<string, number>();
  for (const s of skips) {
    if (!s.error) continue;
    const norm = s.error.replace(/\d+/g, 'N');
    reasonCount.set(norm, (reasonCount.get(norm) ?? 0) + 1);
  }
  const topReasons = [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [r, n] of topReasons) console.log(`  ${n.toString().padStart(3)}  ${r}`);

  // 4. Por fuente — qué fuentes generan alertas que terminan SENT
  console.log('\n=== ALERTAS SENT POR FUENTE ===');
  const sent = allAlerts.filter((a) => a.status === 'sent');
  const sentBySource = new Map<string, number>();
  for (const a of sent) {
    const src = propMap.get(a.propertyId)?.source ?? '?';
    sentBySource.set(src, (sentBySource.get(src) ?? 0) + 1);
  }
  for (const [s, n] of [...sentBySource.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${n.toString().padStart(3)}  ${s}`);

  // 5. SENT por zona
  console.log('\n=== ALERTAS SENT POR ZONA ===');
  const sentByZone = new Map<string, number>();
  for (const a of sent)
    sentByZone.set(a.zone.name ?? '?', (sentByZone.get(a.zone.name ?? '?') ?? 0) + 1);
  for (const [z, n] of [...sentByZone.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${n.toString().padStart(3)}  ${z}`);

  // 6. Últimas 15 sent
  console.log('\n=== ÚLTIMAS 15 ALERTAS ENVIADAS ===');
  const lastSent = sent.slice(0, 15);
  for (const a of lastSent) {
    const p = propMap.get(a.propertyId);
    console.log(
      `  ${a.sentAt?.toISOString().slice(0, 16)} | ${a.zone.name} | ${p?.source ?? '?'} | CP ${p?.postalCode ?? '?'} | €${p?.price ?? '?'} | ${a.trigger}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
