// Test de conectividad: manda un mensaje corto a cada chat configurado.
// No genera informe Pulse (no quema tokens de Anthropic).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TelegramClient, getTelegramConfigFromEnv, markdownToTelegramHtml } from '@lince/notifier';

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

async function main(): Promise<void> {
  const chatIdsRaw = process.env.TELEGRAM_CHAT_IDS?.trim();
  if (!chatIdsRaw) {
    console.error('TELEGRAM_CHAT_IDS no está en .env');
    process.exit(2);
  }
  const chatIds = chatIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const md = `# Test Lince Pulse

Bot conectado correctamente. Si ves este mensaje **formateado** (negrita, lista, etc.), todo va bien.

- Lince Pulse genera informes semanales con razonamiento + oferta concreta + argumentos.
- Detecta 6 tipos de oportunidad (subastas, bancarios, premium oculto, etc.).
- Listo para mandar a inversores, buying agents, inmobiliarias o flippers.

Próximo paso: \`pnpm pulse:dispatch\` enviará el informe real.`;

  const html = markdownToTelegramHtml(md);
  const client = new TelegramClient(getTelegramConfigFromEnv());

  console.error(
    `Modo: ${client.isDryRun() ? 'DRY' : 'LIVE'}. Enviando a ${chatIds.length} chat(s)...`,
  );

  let ok = 0;
  let fail = 0;
  for (const chatId of chatIds) {
    const result = await client.sendMessage({
      chatId,
      text: html,
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
    if (result.ok) {
      ok += 1;
      console.error(`  ✅ ${chatId} — ${result.chunks} mensaje(s)`);
    } else {
      fail += 1;
      console.error(`  ❌ ${chatId} — ${result.error}`);
    }
  }
  console.error(`\nResultado: ${ok}/${chatIds.length} OK, ${fail} fallos.`);
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
