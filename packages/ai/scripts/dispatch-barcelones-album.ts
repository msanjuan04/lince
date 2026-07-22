// Dispatch álbum visual del Barcelonès — formato "solo imágenes" pedido por Marc.
//
// NO genera narrativa Claude (coste €0). Manda 1 sendPhoto por propiedad con
// caption HTML que incluye:
//   - 🔗 Dirección clicable al sourceUrl
//   - 💰 Precio, m², €/m²
//   - 📈 Yield estimado (alquiler m² × benchmark zona / precio compra)
//   - 📅 Días publicada (desde firstSeen)
//   - 📉 Rebajas históricas si hay
//   - 🏛 Valor catastral si está en DB (pendiente integración Catastro abierto)
//
// Filtros:
//   - CPs Barcelonès + ciudad real (Solvia tiene CPs falseados)
//   - Sin red flags duras: ocupado, inquilino, VPO, sin cédula, ilegal, precio oculto
//   - Yield estimado >= --min-yield (default 30)
//
// Uso:
//   pnpm --filter @lince/ai exec tsx scripts/dispatch-barcelones-album.ts
//   pnpm --filter @lince/ai exec tsx scripts/dispatch-barcelones-album.ts --min-yield 20 --max 10

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@lince/db';
import { TelegramClient, getTelegramConfigFromEnv } from '@lince/notifier';

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
// CPs + ciudades del Barcelonès
// ─────────────────────────────────────────────────────────────────────────────

function range(a: number, b: number): string[] {
  const out: string[] = [];
  for (let i = a; i <= b; i += 1) out.push(String(i).padStart(5, '0'));
  return out;
}

const BARCELONES_CPS = [
  ...range(8001, 8042),
  ...range(8901, 8908),
  ...range(8911, 8918),
  ...range(8921, 8924),
  '08930',
];

const BARCELONES_CITY_KEYS = [
  'barcelona',
  "l'hospitalet",
  'hospitalet',
  'badalona',
  'santa coloma',
  'sant adri',
];

function isBarcelonesCity(city: string | null): boolean {
  if (!city) return false;
  const norm = city.toLowerCase();
  return BARCELONES_CITY_KEYS.some((k) => norm.includes(k));
}

const HARD_BLOCK_FLAGS = new Set([
  'occupied',
  'has_tenant',
  'vpo',
  'no_habitability',
  'illegal_construction',
  'hidden_price',
]);

// Benchmarks alquiler €/m²/mes (Q1 2026 — idealista informe del mercado)
const RENT_BENCHMARK: Record<string, number> = {
  barcelona: 22,
  hospitalet: 17,
  badalona: 14,
  'santa coloma': 13,
  'sant adri': 14,
};

function rentBenchmark(city: string | null): number | null {
  if (!city) return null;
  const norm = city.toLowerCase();
  for (const [k, v] of Object.entries(RENT_BENCHMARK)) {
    if (norm.includes(k)) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

interface Args {
  minYield: number;
  maxItems: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let minYield = 30;
  let maxItems = 12;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--min-yield') {
      const v = argv[i + 1];
      if (v) minYield = Math.max(0, Number.parseFloat(v) || 30);
    } else if (a === '--max') {
      const v = argv[i + 1];
      if (v) maxItems = Math.max(1, Number.parseInt(v, 10) || 12);
    }
  }
  return { minYield, maxItems };
}

// ─────────────────────────────────────────────────────────────────────────────
// Caption HTML por propiedad
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n) + '€';
}

interface CaptionInputs {
  index: number;
  total: number;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  price: number;
  m2: number;
  pricePerM2: number;
  yieldPct: number;
  daysOnMarket: number;
  totalDrops: number;
  lastDropPct: number | null;
  cumulativeDropPct: number | null;
  cadastralValue: number | null;
  cadastralRef: string | null;
  sourceUrl: string | null;
  source: string;
}

function buildCaption(c: CaptionInputs): string {
  const lines: string[] = [];

  // Header con dirección clicable
  const addr = escapeHtml(c.address ?? 'Sin dirección');
  const cityLine = escapeHtml([c.postalCode, c.city].filter(Boolean).join(' '));
  if (c.sourceUrl) {
    lines.push(`🔗 <b><a href="${escapeAttr(c.sourceUrl)}">${addr}</a></b>`);
  } else {
    lines.push(`🔗 <b>${addr}</b>`);
  }
  if (cityLine) lines.push(cityLine);
  lines.push('');

  // Datos económicos
  lines.push(`💰 <b>${formatEur(c.price)}</b> · ${c.m2}m² · ${formatEur(c.pricePerM2)}/m²`);
  lines.push(`📈 Yield estimado: <b>${c.yieldPct.toFixed(1)}%</b>`);

  // Tiempo en mercado
  lines.push(`📅 Publicada hace ${c.daysOnMarket} días`);

  // Rebajas
  if (c.totalDrops > 0) {
    const cumStr =
      c.cumulativeDropPct !== null ? ` · acumulado ${c.cumulativeDropPct.toFixed(1)}%` : '';
    const lastStr = c.lastDropPct !== null ? `última ${c.lastDropPct.toFixed(1)}%` : '';
    lines.push(
      `📉 ${c.totalDrops} rebaja${c.totalDrops > 1 ? 's' : ''}${lastStr ? ` · ${lastStr}` : ''}${cumStr}`,
    );
  } else {
    lines.push(`📉 Sin rebajas registradas`);
  }

  // Catastro
  if (c.cadastralValue) {
    lines.push(`🏛 Valor catastral: ${formatEur(c.cadastralValue)}`);
  } else if (c.cadastralRef) {
    // Link clicable a la Sede Electrónica del Catastro — el usuario hace 1 click
    // y ve el valor de referencia oficial. La API REST está caída intermitente,
    // este link va a la web pública que es fiable.
    const catastroUrl = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?refcat=${encodeURIComponent(c.cadastralRef)}`;
    // Estimación rápida: valor catastral típicamente ~55% del precio de mercado.
    const estimated = Math.round(c.price * 0.55);
    lines.push(
      `🏛 Catastral ~${formatEur(estimated)} estimado · <a href="${escapeAttr(catastroUrl)}">ver en Catastro</a>`,
    );
  } else {
    lines.push(`🏛 Valor catastral: —`);
  }

  // Footer
  lines.push('');
  lines.push(`<i>${c.index}/${c.total} · Fuente: ${c.source}</i>`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  console.error(`[album] min-yield=${args.minYield}% max=${args.maxItems}`);

  // 1. Pool generoso
  const raw = await prisma.property.findMany({
    where: {
      postalCode: { in: BARCELONES_CPS },
      price: { not: null },
      m2: { not: null },
      pricePerM2: { not: null },
      mainImageUrl: { not: null }, // sin foto no entra (es un álbum visual)
    },
    include: { priceHistory: { orderBy: { observedAt: 'desc' }, take: 20 } },
    orderBy: [{ pricePerM2: 'asc' }],
    take: 500,
  });

  // 2. Filtro hard + ciudad real
  const eligible = raw.filter((p) => {
    for (const f of p.redFlags ?? []) if (HARD_BLOCK_FLAGS.has(f)) return false;
    return isBarcelonesCity(p.city);
  });

  // 3. Calcular yield estimado + agregar metadata
  const enriched = eligible
    .map((p) => {
      const rent = rentBenchmark(p.city);
      const m2 = p.m2!;
      const price = Number(p.price);
      if (!rent || price <= 0 || m2 <= 0) return null;
      const yieldPct = ((rent * m2 * 12) / price) * 100;

      const drops = p.priceHistory.filter((h) => h.deltaPct != null && Number(h.deltaPct) < 0);
      const totalDrops = drops.length;
      const lastDropPct = drops.length > 0 ? Number(drops[0]!.deltaPct) : null;
      let cumulativeDropPct: number | null = null;
      if (p.priceHistory.length >= 2) {
        const oldest = p.priceHistory[p.priceHistory.length - 1]!;
        const newest = p.priceHistory[0]!;
        const oldP = Number(oldest.newPrice);
        const newP = Number(newest.newPrice);
        if (oldP > 0 && newP > 0 && newP !== oldP) {
          cumulativeDropPct = ((newP - oldP) / oldP) * 100;
        }
      }
      const daysOnMarket = Math.floor((Date.now() - p.firstSeen.getTime()) / (1000 * 60 * 60 * 24));

      // Valor catastral si Solvia/Aliseda lo trae en rawData (raro pero por si acaso)
      const rd = p.rawData as Record<string, unknown> | null;
      const cadastralValue =
        rd && typeof rd.valorCatastral === 'number' ? (rd.valorCatastral as number) : null;

      return {
        property: p,
        yieldPct,
        totalDrops,
        lastDropPct,
        cumulativeDropPct,
        daysOnMarket,
        cadastralValue,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 4. Filtro yield mínimo + sort por yield desc
  const passing = enriched
    .filter((x) => x.yieldPct >= args.minYield)
    .sort((a, b) => b.yieldPct - a.yieldPct)
    .slice(0, args.maxItems);

  if (passing.length === 0) {
    console.error(`[album] Ninguna propiedad pasa el filtro yield >= ${args.minYield}%. Aborto.`);
    console.error(
      `[album] Sugerencia: prueba con --min-yield 20 (hay ${enriched.filter((x) => x.yieldPct >= 20).length} props).`,
    );
    process.exit(1);
  }

  console.error(
    `[album] Pool=${raw.length} | elegibles=${eligible.length} | con yield ≥${args.minYield}%=${passing.length}`,
  );

  // 5. Destinatarios
  const chatIdsRaw = process.env.TELEGRAM_CHAT_IDS?.trim();
  if (!chatIdsRaw) {
    console.error('[album] TELEGRAM_CHAT_IDS vacío. Aborto envío.');
    process.exit(2);
  }
  const chatIds = chatIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const telegram = new TelegramClient(getTelegramConfigFromEnv());
  console.error(
    `[album] Telegram ${telegram.isDryRun() ? 'DRY' : 'LIVE'} — enviando ${passing.length} foto(s) a ${chatIds.length} chat(s)...`,
  );

  // 6. Header (un sendMessage HTML breve antes de las fotos)
  const header = [
    `🏠 <b>Lince Pulse — Gangas del Barcelonès</b>`,
    ``,
    `Filtro: yield estimado ≥ ${args.minYield}%, sin ocupados, sin VPO.`,
    `Top ${passing.length} ordenadas por rentabilidad.`,
  ].join('\n');

  let ok = 0;
  let fail = 0;
  for (const chatId of chatIds) {
    // Mandar header
    const headerRes = await telegram.sendMessage({
      chatId,
      text: header,
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
    if (!headerRes.ok) {
      console.error(`  ❌ ${chatId} (header) — ${headerRes.error}`);
      fail += 1;
      continue;
    }

    // Mandar 1 foto por propiedad
    let chatOk = true;
    for (let i = 0; i < passing.length; i += 1) {
      const e = passing[i]!;
      const p = e.property;
      const caption = buildCaption({
        index: i + 1,
        total: passing.length,
        address: p.address,
        city: p.city,
        postalCode: p.postalCode,
        price: Number(p.price),
        m2: p.m2!,
        pricePerM2: Number(p.pricePerM2),
        yieldPct: e.yieldPct,
        daysOnMarket: e.daysOnMarket,
        totalDrops: e.totalDrops,
        lastDropPct: e.lastDropPct,
        cumulativeDropPct: e.cumulativeDropPct,
        cadastralValue: e.cadastralValue,
        cadastralRef: p.cadastralRef ?? null,
        sourceUrl: p.sourceUrl,
        source: p.source,
      });

      const res = await telegram.sendPhoto({
        chatId,
        photoUrl: p.mainImageUrl!,
        caption,
        parseMode: 'HTML',
        disableNotification: i > 0, // solo notifica la primera foto del lote
      });

      if (!res.ok) {
        console.error(`  ❌ ${chatId} (foto ${i + 1}) — ${res.error}`);
        chatOk = false;
      }
    }

    if (chatOk) {
      ok += 1;
      console.error(`  ✅ ${chatId} — ${passing.length} fotos enviadas`);
    } else {
      fail += 1;
    }
  }

  console.error(`\n[album] Resumen: ${ok}/${chatIds.length} chats OK, ${fail} con fallos.`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((err: unknown) => {
    console.error('[album] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
