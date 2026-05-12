// Actualiza la zona "Smoke BCN 08019" con el teléfono de Marc para recibir
// alertas WhatsApp reales cuando llegue el access token.
//
// Idempotente — se puede correr múltiples veces sin efectos secundarios.
// Resetea las alertas existentes a 'pending' para que el siguiente
// evaluate-zones las reintente (en lugar de quedarse en 'skipped').

import { prisma } from '../src/index';

async function main(): Promise<void> {
  const phoneE164 = '34623808712'; // +34 623 808 712 normalizado

  const zone = await prisma.zone.findFirst({
    where: { name: 'Smoke BCN 08019' },
  });
  if (!zone) {
    console.error('No existe la zona "Smoke BCN 08019". Corre smoke-zones primero.');
    process.exit(1);
  }

  await prisma.zone.update({
    where: { id: zone.id },
    data: {
      alertPhoneE164: phoneE164,
      alertChannels: { set: ['whatsapp'] },
    },
  });
  console.log(`✓ Zone "${zone.name}" actualizada con phone=${phoneE164}`);

  // Reset de alertas skipped → pending para que el evaluator las vuelva a intentar
  const reset = await prisma.zoneAlert.updateMany({
    where: { zoneId: zone.id, status: 'skipped' },
    data: { status: 'pending', error: null },
  });
  console.log(`✓ ${reset.count} alertas reseteadas de 'skipped' → 'pending'`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
