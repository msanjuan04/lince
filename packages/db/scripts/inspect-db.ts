// Script de inspección puntual: lista tablas en public y conteo de filas.
// Uso: cd packages/db && set -a && . ../../.env.local && set +a && pnpm exec tsx scripts/inspect-db.ts

import { prisma } from '../src/index.js';

type Row = { table_name: string };

async function main(): Promise<void> {
  const tables = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  console.log('Tablas en public:', tables.length);
  for (const t of tables) {
    try {
      const c = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM "${t.table_name}"`,
      );
      const n = c[0]?.n ?? 0n;
      console.log(`  - ${t.table_name}: ${n.toString()} filas`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  - ${t.table_name}: error: ${msg}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
