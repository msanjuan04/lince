// CLI puntual: envía UN mensaje de prueba a un número, independiente del
// flujo de zone-alerts. Útil para validar credenciales y plantilla.
//
// Uso:
//   pnpm --filter @lince/scheduler exec tsx src/test-whatsapp.ts
//   pnpm --filter @lince/scheduler exec tsx src/test-whatsapp.ts -- --to 34623808712

import { WhatsAppClient, getWhatsAppConfigFromEnv, normalizeE164 } from '@lince/notifier';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let to = '34623808712'; // default: número de Marc
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--to' && argv[i + 1]) {
      to = argv[i + 1]!;
      i += 1;
    }
  }
  const normalized = normalizeE164(to);
  if (!normalized) {
    console.error(`Número inválido: ${to}`);
    process.exit(2);
  }

  const config = getWhatsAppConfigFromEnv();
  if (!config) {
    console.error(
      'Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env.local. Modo DRY: no se enviará.',
    );
  }

  const client = new WhatsAppClient(config);

  const body = [
    '🎉 Test de Lince Pulse',
    '',
    'Si recibes este mensaje, la integración con WhatsApp Cloud API funciona.',
    '',
    'A partir de aquí, recibirás alertas reales cuando aparezcan oportunidades',
    'en las zonas que tengas configuradas.',
    '',
    '— Lince',
  ].join('\n');

  console.log(`→ Enviando a ${normalized}...`);
  const result = await client.sendText({ to: normalized, body });

  console.log('\n=== RESULTADO ===');
  console.log(`  ok:        ${result.ok}`);
  console.log(`  dryRun:    ${result.dryRun}`);
  console.log(`  messageId: ${result.messageId ?? '—'}`);
  console.log(`  error:     ${result.error ?? '—'}`);

  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
