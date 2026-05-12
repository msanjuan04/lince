// Job: enriquecer propiedades con coordenadas oficiales del Catastro.
//
// Itera propiedades que tienen `cadastralRef` pero no tienen `lat`/`lng`.
// Por cada una, consulta el Catastro y persiste lat/lng + first official
// address en rawData (sin sobrescribir address si la fuente ya la expuso).

import { prisma } from '@lince/db';
import { CatastroEnricher } from '../enrichers/catastro';

export interface EnrichCatastroOptions {
  /** Máximo de propiedades a procesar. Default 1000 (suficiente para todo). */
  maxItems?: number;
  /** Solo lookahead: log lo que se haría sin tocar la DB. */
  dryRun?: boolean;
}

export interface EnrichCatastroResult {
  attempted: number;
  enriched: number;
  notFound: number;
  errors: number;
  durationMs: number;
}

export async function runEnrichCatastro(
  opts: EnrichCatastroOptions = {},
): Promise<EnrichCatastroResult> {
  const cap = opts.maxItems ?? 1000;
  const startedAt = Date.now();
  const enricher = new CatastroEnricher();

  // Candidatos: con ref catastral, sin lat/lng.
  const candidates = await prisma.property.findMany({
    where: {
      cadastralRef: { not: null },
      OR: [{ lat: null }, { lng: null }],
    },
    select: { id: true, cadastralRef: true, address: true, source: true },
    take: cap,
  });

  console.log(
    `[enrich-catastro] ${candidates.length} candidatos (con ref catastral, sin lat/lng).${opts.dryRun ? ' [DRY RUN]' : ''}`,
  );

  let enriched = 0;
  let notFound = 0;
  let errors = 0;

  for (const c of candidates) {
    if (!c.cadastralRef) continue;
    try {
      const result = await enricher.lookup(c.cadastralRef);
      if (!result) {
        notFound += 1;
        continue;
      }
      console.log(
        `[enrich-catastro] ${c.cadastralRef} → ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} | ${result.officialAddress ?? '—'}`,
      );
      if (!opts.dryRun) {
        await prisma.property.update({
          where: { id: c.id },
          data: {
            lat: result.lat,
            lng: result.lng,
            // Si la fuente NO expuso address, usamos la del Catastro.
            // No sobrescribimos las que ya tienen address (la fuente puede tener
            // más contexto que la dirección catastral, ej. "C/ Aribau, cerca de
            // Diagonal" vs "CL ARIBAU 145 BARCELONA").
            address: c.address ?? result.officialAddress,
          },
        });
      }
      enriched += 1;
    } catch (err) {
      console.warn(`[enrich-catastro] ${c.cadastralRef} error:`, err);
      errors += 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `\n[enrich-catastro] done in ${(durationMs / 1000).toFixed(1)}s | enriched=${enriched} notFound=${notFound} errors=${errors}`,
  );
  return { attempted: candidates.length, enriched, notFound, errors, durationMs };
}
