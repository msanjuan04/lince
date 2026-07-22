// Dispatch ad-hoc: gangas reales del Barcelonès — sin ocupados, sin VPO,
// sin cédula problemática. Sort por €/m² ascendente. Manda al chat de Telegram
// configurado en TELEGRAM_CHAT_IDS.
//
// Uso:
//   pnpm --filter @lince/ai exec tsx scripts/dispatch-barcelones-gangas.ts
//   pnpm --filter @lince/ai exec tsx scripts/dispatch-barcelones-gangas.ts --top 8 --role buying_agent

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@lince/db';
import { TelegramClient, getTelegramConfigFromEnv } from '@lince/notifier';
import {
  generatePulseReport,
  sendPulseReportToTelegram,
  type PulseReportInput,
  type PulsePropertyInput,
  type PulseReaderRole,
  type PulseZoneStats,
} from '../src';

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
      if (!process.env[key] && value) process.env[key] = value;
    }
    break;
  }
}

loadEnvSoft();

// ─────────────────────────────────────────────────────────────────────────────
// Comarca del Barcelonès — los 5 municipios y sus CPs activos
// ─────────────────────────────────────────────────────────────────────────────

function range(fromInclusive: number, toInclusive: number): string[] {
  const out: string[] = [];
  for (let i = fromInclusive; i <= toInclusive; i += 1) {
    out.push(String(i).padStart(5, '0'));
  }
  return out;
}

const BARCELONES_CPS: string[] = [
  ...range(8001, 8042), // Barcelona ciudad
  ...range(8901, 8908), // L'Hospitalet de Llobregat
  ...range(8911, 8918), // Badalona
  ...range(8921, 8924), // Santa Coloma de Gramenet
  '08930', // Sant Adrià de Besòs
];

/**
 * Whitelist de municipios reales del Barcelonès. Necesario porque Solvia tiene
 * datos sucios: pone `cp: "08010"` (Eixample BCN) a propiedades de Artés, Calaf,
 * Berga, etc. El campo `city` sí es fiable, así que cruzamos por CP + ciudad.
 */
const BARCELONES_CITIES = new Set(
  [
    'barcelona',
    "l'hospitalet de llobregat",
    'l hospitalet de llobregat',
    'hospitalet de llobregat',
    'badalona',
    'santa coloma de gramenet',
    'sant adrià de besòs',
    'sant adria de besos',
  ].map((s) => s.toLowerCase()),
);

function isBarcelonesCity(city: string | null): boolean {
  if (!city) return false;
  // Normalizar: quitar acentos, lowercase, trim
  const norm = city.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return Array.from(BARCELONES_CITIES).some((c) => {
    const cNorm = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return norm === cNorm || norm.includes(cNorm);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtros de "ganga real": sin ocupados, sin VPO, sin sin-cédula, sin cargas,
// sin precio oculto, sin construcción ilegal.
// ─────────────────────────────────────────────────────────────────────────────

const HARD_BLOCK_FLAGS = new Set([
  'occupied',
  'has_tenant',
  'vpo',
  'no_habitability',
  'illegal_construction',
  'hidden_price',
]);

interface Args {
  role: PulseReaderRole;
  topN: number;
  fetchPool: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let role: PulseReaderRole = 'inversor_directo';
  let topN = 8;
  let fetchPool = 60;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--role') {
      const v = argv[i + 1];
      if (
        v === 'inmobiliaria' ||
        v === 'buying_agent' ||
        v === 'inversor_directo' ||
        v === 'flipper'
      ) {
        role = v;
      }
    } else if (a === '--top') {
      const v = argv[i + 1];
      if (v) topN = Math.max(1, Number.parseInt(v, 10) || 8);
    } else if (a === '--pool') {
      const v = argv[i + 1];
      if (v) fetchPool = Math.max(topN, Number.parseInt(v, 10) || 60);
    }
  }
  return { role, topN, fetchPool };
}

// Detecta rebaja reciente: cualquier deltaPct negativo en los últimos 90d.
function summarizePriceDrops(
  history: Array<{ oldPrice: unknown; newPrice: unknown; deltaPct: unknown; observedAt: Date }>,
): { drops: number; lastDropPct: number | null; totalDropPct: number | null } {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = history.filter(
    (h) => h.observedAt.getTime() >= cutoff && h.deltaPct !== null && Number(h.deltaPct) < 0,
  );
  const drops = recent.length;
  const lastDropPct = recent.length > 0 ? Number(recent[0]!.deltaPct) : null;
  // Acumulado: primer precio vs último, si tenemos 2+ snapshots
  let totalDropPct: number | null = null;
  if (history.length >= 2) {
    const oldest = history[history.length - 1]!;
    const newest = history[0]!;
    const oldP = Number(oldest.newPrice);
    const newP = Number(newest.newPrice);
    if (oldP > 0 && newP > 0 && newP !== oldP) {
      totalDropPct = Math.round(((newP - oldP) / oldP) * 10000) / 100;
    }
  }
  return { drops, lastDropPct, totalDropPct };
}

async function loadGangasBarcelones(opts: Args): Promise<PulseReportInput> {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  // 1. Fetch pool MUCHO más grande (porque Solvia tiene CPs falseados, hay que
  //    sobre-leer para que tras filtrar por ciudad real quede top N suficiente).
  const raw = await prisma.property.findMany({
    where: {
      postalCode: { in: BARCELONES_CPS },
      price: { not: null },
      m2: { not: null },
      pricePerM2: { not: null },
    },
    orderBy: [{ pricePerM2: 'asc' }],
    take: opts.fetchPool * 4, // sobre-lee 4x para compensar Solvia sucio
    include: {
      priceHistory: {
        orderBy: { observedAt: 'desc' },
        take: 10,
      },
    },
  });

  // 2. Post-filtro: excluir banderas duras + verificar ciudad real (Solvia tiene
  //    CPs falseados — propiedades de Artés/Calaf/Berga aparecen con CP de BCN).
  const eligible = raw.filter((p) => {
    for (const f of p.redFlags ?? []) {
      if (HARD_BLOCK_FLAGS.has(f)) return false;
    }
    // Cruce CP + ciudad: aceptar solo si la ciudad es del Barcelonès real.
    if (!isBarcelonesCity(p.city)) return false;
    return true;
  });

  // 3. Tomar top N por €/m² ASC (ya vienen ordenadas).
  const top = eligible.slice(0, opts.topN);

  const bySource: Record<string, number> = {};
  for (const p of top) bySource[p.source] = (bySource[p.source] ?? 0) + 1;
  console.error(
    `[gangas] CPs=${BARCELONES_CPS.length} | pool=${raw.length} | elegibles (city+flags)=${eligible.length} | top final=${top.length}`,
  );
  console.error(`[gangas] Distribución del top por fuente:`, bySource);
  console.error(
    `[gangas] Ciudades del top:`,
    top.map((p) => `${p.city}(${p.postalCode})`).join(' | '),
  );

  // 4. Map a PulsePropertyInput + meta rebajas en rawData para el prompt.
  const properties: PulsePropertyInput[] = top.map((p) => {
    const drops = summarizePriceDrops(p.priceHistory);
    return {
      id: p.id,
      source: p.source,
      type: p.type,
      address: p.address,
      city: p.city,
      postalCode: p.postalCode,
      province: p.province,
      m2: p.m2,
      rooms: p.rooms,
      bathrooms: p.bathrooms,
      yearBuilt: p.yearBuilt,
      price: p.price ? Number(p.price) : null,
      pricePerM2: p.pricePerM2 ? Number(p.pricePerM2) : null,
      zoneAvgPricePerM2: p.zoneAvgPricePerM2 ? Number(p.zoneAvgPricePerM2) : null,
      opportunityScore: p.opportunityScore ? Number(p.opportunityScore) : null,
      description: p.description ? p.description.slice(0, 800) : null,
      condition: p.condition,
      hasTerrace: p.hasTerrace,
      hasElevator: p.hasElevator,
      floor: p.floor,
      orientation: p.orientation,
      isBankOwned: p.isBankOwned,
      isAuction: p.isAuction,
      auctionStartingPrice: p.auctionStartingPrice ? Number(p.auctionStartingPrice) : null,
      redFlags: p.redFlags ?? [],
      estimatedMonthlyRent: null,
      daysOnMarket: Math.floor((weekEnd.getTime() - p.firstSeen.getTime()) / (1000 * 60 * 60 * 24)),
      sourceUrl: p.sourceUrl ?? null,
      mainImageUrl: p.mainImageUrl ?? null,
      priceDrops: drops.drops,
      lastDropPct: drops.lastDropPct,
      totalDropPct: drops.totalDropPct,
    } as PulsePropertyInput & {
      priceDrops: number;
      lastDropPct: number | null;
      totalDropPct: number | null;
    };
  });

  // 5. Stats de zona reales (mediana por CP que aparezca).
  const cps = Array.from(
    new Set(properties.map((p) => p.postalCode).filter((c): c is string => !!c)),
  );
  const zoneRows = await prisma.$queryRaw<
    Array<{
      postal_code: string;
      city: string | null;
      province: string | null;
      median_price_per_m2: number | null;
      count: bigint;
    }>
  >`
    SELECT postal_code,
           MAX(city) AS city,
           MAX(province) AS province,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_m2)::float AS median_price_per_m2,
           COUNT(*) AS count
    FROM properties
    WHERE postal_code = ANY(${cps})
      AND price_per_m2 IS NOT NULL
      AND COALESCE(is_auction, false) = false
    GROUP BY postal_code
    HAVING COUNT(*) >= 3
    ORDER BY postal_code
  `;
  const zoneStats: PulseZoneStats[] = zoneRows
    .filter((r) => r.median_price_per_m2 !== null)
    .map((r) => ({
      postalCode: r.postal_code,
      city: r.city,
      province: r.province,
      avgPricePerM2: Number(r.median_price_per_m2),
      propertyCount: Number(r.count),
    }));

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    readerRole: opts.role,
    properties,
    zoneStats,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.error(`[gangas] role=${args.role} topN=${args.topN} pool=${args.fetchPool}`);

  const data = await loadGangasBarcelones(args);

  if (data.properties.length === 0) {
    console.error('[gangas] Sin propiedades elegibles tras filtros — aborto.');
    process.exit(1);
  }

  console.error(`[gangas] Generando informe...`);
  const t0 = Date.now();
  const result = await generatePulseReport(data);
  console.error(
    `[gangas] OK ${Date.now() - t0}ms — tokens in=${result.usage.inputTokens} out=${result.usage.outputTokens}`,
  );

  const chatIdsRaw = process.env.TELEGRAM_CHAT_IDS?.trim();
  if (!chatIdsRaw) {
    console.error('TELEGRAM_CHAT_IDS no está. Aborto envío.');
    process.exit(2);
  }
  const chatIds = chatIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const telegram = new TelegramClient(getTelegramConfigFromEnv());
  console.error(
    `[gangas] Telegram ${telegram.isDryRun() ? 'DRY' : 'LIVE'} — enviando a ${chatIds.length} chat(s)...`,
  );

  let ok = 0;
  let fail = 0;
  for (const chatId of chatIds) {
    try {
      const outcome = await sendPulseReportToTelegram(telegram, {
        chatId,
        markdown: result.markdown,
        properties: data.properties,
        zoneStats: data.zoneStats,
      });
      const narrOk = outcome.narrative.ok;
      const albumOk = outcome.album ? outcome.album.ok : true;
      if (narrOk && albumOk) {
        ok += 1;
        console.error(
          `  ✅ ${chatId} — narrativa ${outcome.narrative.chunks} chunk(s), álbum ${outcome.albumSize} fotos`,
        );
      } else {
        fail += 1;
        const errs: string[] = [];
        if (!narrOk) errs.push(`narrativa: ${outcome.narrative.error ?? 'unknown'}`);
        if (outcome.album && !outcome.album.ok)
          errs.push(`álbum: ${outcome.album.error ?? 'unknown'}`);
        console.error(`  ❌ ${chatId} — ${errs.join(' | ')}`);
      }
    } catch (err) {
      fail += 1;
      console.error(`  ❌ ${chatId} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.error(`\n[gangas] Resumen: ${ok}/${chatIds.length} OK, ${fail} fallos.`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((err: unknown) => {
    console.error('[gangas] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
