// Configura la zona unificada del área metro de Barcelona con el filtro
// "20% bajo €/m² de zona" (que vive en evaluate-zones, no en el JSON de filtros).
//
// - Crea (o actualiza) UNA zona "AMB + alrededores (metro BCN)" con ~101 CPs,
//   canal Telegram, sin maxPrice (el gate €/m² vs zona es global).
// - Desactiva las micro-zonas cuyo conjunto de CPs es todo 08xxx (metro),
//   porque quedan absorbidas. CONSERVA las de costa (17xxx Girona / 43xxx
//   Tarragona), que el usuario quiere mantener.
//
// Idempotente. Modo DRY: `DRY=1` no escribe, solo imprime el plan.

import { prisma } from '../src/index';
import { getAllUniversePostalCodes } from '../src/data/market-reference-2026Q2';

const DRY = process.env['DRY'] === '1';
const ZONE_NAME = 'AMB + alrededores (metro BCN)';

const GRANOLLERS = ['08400', '08401', '08402', '08403'];
const MANRESA = ['08240', '08241', '08242', '08243'];
const TERRASSA_EXTRA = ['08223', '08224', '08225', '08227', '08228'];
const METRO_CPS = Array.from(
  new Set([...getAllUniversePostalCodes(), ...GRANOLLERS, ...MANRESA, ...TERRASSA_EXTRA]),
).sort();

/** Una zona es "metro" (absorbible) si TODOS sus CPs empiezan por 08. */
function isMetroZone(postalCodes: string[]): boolean {
  return postalCodes.length > 0 && postalCodes.every((c) => c.startsWith('08'));
}

async function main(): Promise<void> {
  console.log(`${DRY ? '[DRY] ' : ''}Configurando zona metro (${METRO_CPS.length} CPs)\n`);

  const zones = await prisma.zone.findMany({
    select: { id: true, name: true, postalCodes: true, active: true, agencyId: true },
  });
  const agencyId = zones[0]?.agencyId;
  if (!agencyId) throw new Error('No hay ninguna zona previa de la que tomar agencyId.');

  const existing = zones.find((z) => z.name === ZONE_NAME);

  // Micro-zonas metro (08xxx) a desactivar — y sus CPs, para no perder cobertura:
  // la zona unificada absorbe la unión de todos ellos.
  const metroToDeactivate = zones.filter((z) => z.name !== ZONE_NAME && isMetroZone(z.postalCodes));
  const finalCps = Array.from(
    new Set([...METRO_CPS, ...metroToDeactivate.flatMap((z) => z.postalCodes)]),
  ).sort();
  console.log(
    `CPs finales: ${finalCps.length} (universo ${METRO_CPS.length} + CPs de micro-zonas absorbidas)\n`,
  );

  // 1) Crear o actualizar la zona metro.
  if (existing) {
    console.log(`Zona "${ZONE_NAME}" ya existe (${existing.id}) → actualizar CPs/canal/activa.`);
    if (!DRY) {
      await prisma.zone.update({
        where: { id: existing.id },
        data: {
          postalCodes: finalCps,
          filters: { notes: 'Área metro unificada. Filtro 20% bajo €/m² zona (env).' },
          alertChannels: ['telegram'],
          active: true,
        },
      });
    }
  } else {
    console.log(
      `Crear zona "${ZONE_NAME}" (agency ${agencyId.slice(0, 8)}), canal telegram, activa.`,
    );
    if (!DRY) {
      await prisma.zone.create({
        data: {
          agencyId,
          name: ZONE_NAME,
          postalCodes: finalCps,
          filters: { notes: 'Área metro unificada. Filtro 20% bajo €/m² zona (env).' },
          alertChannels: ['telegram'],
          active: true,
        },
      });
    }
  }

  // 2) Desactivar micro-zonas metro (08xxx), conservar costa (17xxx/43xxx).
  console.log(`\n=== Micro-zonas ===`);
  for (const z of zones) {
    if (z.name === ZONE_NAME) continue;
    const metro = isMetroZone(z.postalCodes);
    if (metro && z.active) {
      console.log(`  ❌ desactivar "${z.name}" [${z.postalCodes.join(', ')}]`);
      if (!DRY) await prisma.zone.update({ where: { id: z.id }, data: { active: false } });
    } else if (!metro) {
      console.log(`  ✅ conservar (costa) "${z.name}" [${z.postalCodes.join(', ')}]`);
    }
  }

  console.log(`\n${DRY ? '[DRY] nada escrito.' : 'Hecho.'}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
