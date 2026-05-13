// Probe del Agente Pulse: carga datos reales de la DB, llama a Claude,
// imprime el informe + métricas de uso.
//
// Uso:
//   pnpm --filter @lince/ai pulse:probe -- --role inversor_directo --top 8
//
// Roles válidos: inmobiliaria, buying_agent, inversor_directo, flipper

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Carga .env de la raíz del monorepo SIN pisar variables que ya estén en el shell.
// (Útil cuando ANTHROPIC_API_KEY vive solo en shell y DATABASE_URL en .env.)
function loadEnvSoft(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Solo set si el shell no la tiene ya con un valor no vacío.
      if (!process.env[key] && value) {
        process.env[key] = value;
      }
    }
    break;
  }
}

loadEnvSoft();

import { generatePulseReport, loadPulseData, type PulseReaderRole } from '../src';

const VALID_ROLES: PulseReaderRole[] = [
  'inmobiliaria',
  'buying_agent',
  'inversor_directo',
  'flipper',
];

function parseArgs(): { role: PulseReaderRole; topN: number; postalCodes?: string[] } {
  const argv = process.argv.slice(2);
  let role: PulseReaderRole = 'inversor_directo';
  let topN = 8;
  let postalCodes: string[] | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--role') {
      const v = argv[i + 1];
      if (v && (VALID_ROLES as string[]).includes(v)) role = v as PulseReaderRole;
      else {
        console.error(`Rol inválido: ${v}. Válidos: ${VALID_ROLES.join(', ')}`);
        process.exit(2);
      }
    } else if (arg === '--top') {
      const v = argv[i + 1];
      if (v) topN = Math.max(1, Number.parseInt(v, 10) || 8);
    } else if (arg === '--cp') {
      const v = argv[i + 1];
      if (v)
        postalCodes = v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    }
  }

  return { role, topN, postalCodes };
}

async function main(): Promise<void> {
  const { role, topN, postalCodes } = parseArgs();

  console.error(
    `[probe] Cargando datos: role=${role} topN=${topN} cps=${postalCodes?.join(',') ?? 'todos'}`,
  );
  const data = await loadPulseData({ readerRole: role, topN, postalCodes });
  console.error(
    `[probe] Datos cargados: ${data.properties.length} propiedades, ${data.zoneStats.length} zonas`,
  );

  if (data.properties.length === 0) {
    console.error('[probe] DB sin propiedades con price+m². Aborto.');
    process.exit(1);
  }

  console.error(`[probe] Llamando a Claude...`);
  const t0 = Date.now();
  const result = await generatePulseReport(data);
  const elapsedMs = Date.now() - t0;

  console.error(`[probe] OK en ${elapsedMs}ms.`);
  console.error(`[probe] Modelo: ${result.model}`);
  console.error(
    `[probe] Tokens — input: ${result.usage.inputTokens}, output: ${result.usage.outputTokens}, cache_create: ${result.usage.cacheCreationInputTokens}, cache_read: ${result.usage.cacheReadInputTokens}`,
  );
  console.error(`[probe] Stop reason: ${result.stopReason}`);
  console.error('');
  console.error('======================== INFORME ========================');
  console.error('');

  // El informe va a stdout para poder redirigir a fichero limpio.
  process.stdout.write(result.markdown);
  process.stdout.write('\n');
}

main()
  .catch((err: unknown) => {
    console.error('[probe] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    // Cerrar Prisma para que el proceso termine.
    const { prisma } = await import('@lince/db');
    await prisma.$disconnect();
  });
