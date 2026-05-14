// Smoke aislado del envío Telegram con fotos+links.
//
// No llama a Claude — pilla las top N props con mainImageUrl de la DB, genera
// captions equivalentes a las que enviaría el dispatch, y manda 1 narrativa
// corta + 1 álbum a los chats configurados.
//
// Uso:
//   pnpm --filter @lince/ai telegram:album-smoke
//   pnpm --filter @lince/ai telegram:album-smoke -- --to 8591040911

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TelegramClient, getTelegramConfigFromEnv, markdownToTelegramHtml } from '@lince/notifier';
import { prisma } from '@lince/db';

function loadEnvSoft(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../../.env.local'),
    resolve(__dirname, '../../../.env.local'),
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
  }
}

loadEnvSoft();

function formatEur(n: number): string {
  const fixed = Math.round(n).toString();
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '€';
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

async function main(): Promise<void> {
  const cliTo = process.argv.includes('--to')
    ? process.argv[process.argv.indexOf('--to') + 1]
    : undefined;

  const chatIds = cliTo
    ? cliTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : (process.env['TELEGRAM_CHAT_IDS']
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? []);
  if (chatIds.length === 0) {
    console.error('Sin chats: TELEGRAM_CHAT_IDS no está en .env');
    process.exit(2);
  }

  const props = await prisma.property.findMany({
    where: { mainImageUrl: { not: null }, price: { not: null }, m2: { not: null } },
    orderBy: [{ price: 'asc' }, { lastSeen: 'desc' }],
    take: 5,
  });
  console.error(`Encontradas ${props.length} props con foto en DB`);
  if (props.length === 0) {
    console.error('No hay propiedades con mainImageUrl, corre primero el crawler.');
    process.exit(3);
  }

  const album = props.map((p, i) => {
    const lines: string[] = [];
    if (i === 0) {
      lines.push('<b>Smoke álbum Pulse — fotos + links</b>');
      lines.push('');
    }
    const address = escapeHtml(p.address ?? 'Sin dirección');
    const header = p.sourceUrl
      ? `<b>${i + 1}. <a href="${escapeAttr(p.sourceUrl)}">${address}</a></b>`
      : `<b>${i + 1}. ${address}</b>`;
    lines.push(header);
    const cpCity = [p.postalCode, p.city].filter(Boolean).join(' ');
    if (cpCity) lines.push(escapeHtml(cpCity));
    const facts: string[] = [];
    if (p.type) facts.push(escapeHtml(p.type));
    if (p.m2) facts.push(`${p.m2}m²`);
    if (p.rooms) facts.push(`${p.rooms} hab`);
    if (facts.length > 0) lines.push(facts.join(' · '));
    if (p.price != null) {
      const priceLine = [`<b>${formatEur(Number(p.price))}</b>`];
      if (p.pricePerM2 != null) priceLine.push(`${formatEur(Number(p.pricePerM2))}/m²`);
      lines.push(priceLine.join(' · '));
    }
    const tags: string[] = [];
    if (p.isAuction) tags.push('Subasta');
    if (p.isBankOwned) tags.push('Bank-owned');
    if (p.condition === 'needs_reform') tags.push('A reformar');
    if (tags.length > 0) lines.push(tags.join(' · '));
    if (p.sourceUrl) {
      lines.push('');
      lines.push(`<a href="${escapeAttr(p.sourceUrl)}">Ver anuncio en ${escapeHtml(p.source)}</a>`);
    }
    return {
      photoUrl: p.mainImageUrl as string,
      caption: lines.join('\n'),
      parseMode: 'HTML' as const,
    };
  });

  const client = new TelegramClient(getTelegramConfigFromEnv());
  console.error(`Modo: ${client.isDryRun() ? 'DRY' : 'LIVE'} · ${chatIds.length} chat(s)`);

  for (const chatId of chatIds) {
    const intro = `# Smoke: álbum Pulse\n\nTest del nuevo dispatch con **fotos + links**. ${album.length} propiedades reales del crawler Pisos.com.`;
    const textResult = await client.sendMessage({
      chatId,
      text: markdownToTelegramHtml(intro),
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
    console.error(`  text ${chatId}: ${textResult.ok ? 'OK' : 'FAIL ' + textResult.error}`);

    const albumResult = await client.sendMediaGroup({
      chatId,
      items: album,
      disableNotification: true,
    });
    console.error(
      `  album ${chatId}: ${albumResult.ok ? `OK (${album.length} fotos)` : 'FAIL ' + albumResult.error}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
