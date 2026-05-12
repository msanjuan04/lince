// Verifica que el adaptador Prisma → tipos UI devuelve datos limpios.
// Replica las llamadas que hace `apps/web/(dashboard)/oportunidades/page.tsx`.

import {
  fetchOpportunities,
  fetchOpportunityStats,
  fetchPropertyById,
} from '../src/lib/data/db.js';

async function main(): Promise<void> {
  console.log('=== SMOKE: data adapter de apps/web ===\n');

  const stats = await fetchOpportunityStats();
  console.log('Stats:', stats);

  console.log('\n--- Sin filtros (todas, sorted by score) ---');
  const all = await fetchOpportunities();
  console.log(`Total: ${all.length}`);
  for (const p of all.slice(0, 5)) {
    console.log(
      `  [${p.opportunityScore.toString().padStart(3)}] ${p.source.padEnd(8)} ${p.type.padEnd(7)} ${p.city.padEnd(20)} CP${p.postalCode} ${p.m2}m² ${p.price.toLocaleString()}€ → ${p.pricePerM2.toFixed(0)}€/m² (zone ${p.zoneAvgPricePerM2.toFixed(0)})`,
    );
    console.log(`        ${p.address}`);
  }

  console.log('\n--- Filtro: solo Pisos.com, max 300k ---');
  const cheap = await fetchOpportunities({ maxPrice: 300_000 });
  console.log(`Encontradas: ${cheap.length}`);
  for (const p of cheap.slice(0, 5)) {
    console.log(`  [${p.opportunityScore}] ${p.source} ${p.address} ${p.price.toLocaleString()}€`);
  }

  console.log('\n--- Detalle de la primera ---');
  if (all[0]) {
    const detail = await fetchPropertyById(all[0].id);
    if (detail) {
      console.log({
        id: detail.id,
        type: detail.type,
        address: detail.address,
        city: detail.city,
        postalCode: detail.postalCode,
        m2: detail.m2,
        rooms: detail.rooms,
        price: detail.price,
        pricePerM2: detail.pricePerM2,
        zoneAvgPricePerM2: detail.zoneAvgPricePerM2,
        opportunityScore: detail.opportunityScore,
        source: detail.source,
        descriptionPreview: detail.description.slice(0, 120),
      });
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
