// Lista los chats que han hablado con el bot recientemente (últimas 24h aprox).
// Útil para descubrir el chat_id de un grupo o conversación privada.
//
// Uso:
//   pnpm --filter @lince/ai telegram:list-chats
//
// Antes de ejecutar:
//   - Privados: el usuario abre el bot en Telegram y manda /start.
//   - Grupos: añade el bot al grupo y manda cualquier mensaje en él.
//   - Canales: añade el bot como admin del canal.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

async function main(): Promise<void> {
  const config = getTelegramConfigFromEnv();
  if (!config) {
    console.error('TELEGRAM_BOT_TOKEN no está configurado en .env');
    process.exit(2);
  }

  const client = new TelegramClient(config);
  const chats = await client.getUpdates();

  if (chats.length === 0) {
    console.log('Sin chats activos en getUpdates.');
    console.log('Asegúrate de que:');
    console.log('  - Privado: alguien le mandó /start al bot.');
    console.log('  - Grupo: el bot está añadido y se mandó al menos 1 mensaje al grupo.');
    console.log('Nota: getUpdates devuelve mensajes de las últimas ~24h.');
    return;
  }

  console.log(`${chats.length} chat(s) detectado(s):\n`);
  for (const chat of chats) {
    const label =
      chat.type === 'private' ? (chat.firstName ?? 'sin nombre') : (chat.title ?? '(sin título)');
    console.log(`  ${chat.chatId.toString().padStart(15)}  [${chat.type.padEnd(10)}] ${label}`);
  }
  console.log('\nPara usarlos:');
  console.log('  TELEGRAM_CHAT_IDS=<id1>,<id2>,...   # mismo rol para todos');
  console.log('  TELEGRAM_PULSE_RECIPIENTS=<id1>:inversor_directo,<id2>:flipper   # rol distinto');
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
