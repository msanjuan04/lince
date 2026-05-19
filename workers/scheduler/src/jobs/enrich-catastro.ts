// Job: enriquecer propiedades con datos del Catastro (público, sin auth).
//
// Por cada propiedad con `cadastralRef`:
//   1. Consulta_CPMRC → lat/lng + dirección oficial (si falta)
//   2. Consulta_DNPRC → año construcción, superficie catastral, uso
//
// Persistimos:
//   - lat/lng en columnas dedicadas (si vienen)
//   - yearBuilt en su columna (solo si la fuente NO lo expuso ya)
//   - rawData.catastro = { yearBuilt, surfaceM2, use, fetchedAt } — payload completo
//
// El `fetchedAt` evita re-consultar la API cada noche: solo procesamos las
// propiedades cuya rawData.catastro aún no se haya rellenado (o sea null).
//
// Rate limit: 1 req/s en el enricher. Con 100 props nuevas/día = ~2-3 min.

import { prisma } from '@lince/db';
import { CatastroEnricher } from '../enrichers/catastro';

export interface EnrichCatastroOptions {
  /** Máximo de propiedades a procesar. Default 1000. */
  maxItems?: number;
  /** Solo loggear sin tocar DB. */
  dryRun?: boolean;
  /** Forzar re-consulta aunque ya tengamos rawData.catastro. Default false. */
  force?: boolean;
}

export interface EnrichCatastroResult {
  attempted: number;
  enriched: number;
  enrichedCoords: number;
  enrichedBuildingInfo: number;
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

  // Candidatos: con ref catastral, y O bien sin lat/lng O bien sin datos
  // Catastro en rawData. El force=true ignora el segundo filtro.
  const candidates = await prisma.property.findMany({
    where: {
      cadastralRef: { not: null },
    },
    select: {
      id: true,
      cadastralRef: true,
      address: true,
      lat: true,
      lng: true,
      yearBuilt: true,
      rawData: true,
      source: true,
    },
    take: cap * 2, // pedimos más para filtrar después por rawData.catastro
  });

  const needsWork = candidates.filter((c) => {
    const hasCoords = c.lat !== null && c.lng !== null;
    const raw = (c.rawData ?? {}) as Record<string, unknown>;
    const hasCatastro = !!raw.catastro && (raw.catastro as Record<string, unknown>).fetchedAt;
    if (opts.force) return true;
    return !hasCoords || !hasCatastro;
  });
  const slice = needsWork.slice(0, cap);

  console.log(
    `[enrich-catastro] ${candidates.length} con ref catastral · ${slice.length} a procesar${opts.dryRun ? ' [DRY RUN]' : ''}`,
  );

  let enrichedCoords = 0;
  let enrichedBuildingInfo = 0;
  let notFound = 0;
  let errors = 0;
  let enriched = 0;

  for (const c of slice) {
    if (!c.cadastralRef) continue;
    try {
      const needsCoords = c.lat === null || c.lng === null;
      const raw = (c.rawData ?? {}) as Record<string, unknown>;
      const needsBuildingInfo = opts.force || !raw.catastro;

      // ── 1. Coords (Consulta_CPMRC) ───────────────────────────────────────
      const coords = needsCoords ? await enricher.lookup(c.cadastralRef) : null;

      // ── 2. Building info (Consulta_DNPRC) ────────────────────────────────
      const building = needsBuildingInfo ? await enricher.lookupBuildingInfo(c.cadastralRef) : null;

      if (!coords && !building) {
        notFound += 1;
        continue;
      }

      // Logging legible — qué datos hemos cogido para esta ref.
      const summary: string[] = [];
      if (coords) summary.push(`coords=${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`);
      if (building) {
        const parts: string[] = [];
        if (building.yearBuilt) parts.push(`año=${building.yearBuilt}`);
        if (building.surfaceM2) parts.push(`sfc=${building.surfaceM2}m²`);
        if (building.use) parts.push(`uso=${building.use}`);
        summary.push(`catastro=${parts.join(' ') || '(vacío)'}`);
      }
      console.log(`[enrich-catastro] ${c.cadastralRef} → ${summary.join(' · ')}`);

      if (opts.dryRun) {
        if (coords) enrichedCoords += 1;
        if (building) enrichedBuildingInfo += 1;
        enriched += 1;
        continue;
      }

      // Construir UPDATE — solo tocamos campos para los que tenemos dato nuevo.
      const data: Record<string, unknown> = {};
      if (coords) {
        data.lat = coords.lat;
        data.lng = coords.lng;
        // Solo rellenamos address si la fuente original no la tenía
        if (!c.address && coords.officialAddress) {
          data.address = coords.officialAddress;
        }
        enrichedCoords += 1;
      }
      if (building) {
        // yearBuilt: rellenar SOLO si la propiedad no lo tenía ya
        if (c.yearBuilt === null && building.yearBuilt !== null) {
          data.yearBuilt = building.yearBuilt;
        }
        // rawData.catastro: payload completo + timestamp para dedup
        const newRaw = {
          ...(raw as object),
          catastro: {
            yearBuilt: building.yearBuilt,
            surfaceM2: building.surfaceM2,
            use: building.use,
            officialAddress: building.officialAddress,
            fetchedAt: new Date().toISOString(),
          },
        };
        data.rawData = newRaw;
        enrichedBuildingInfo += 1;
      }

      if (Object.keys(data).length > 0) {
        await prisma.property.update({ where: { id: c.id }, data });
        enriched += 1;
      }
    } catch (err) {
      console.warn(`[enrich-catastro] ${c.cadastralRef} error:`, err);
      errors += 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `\n[enrich-catastro] done in ${(durationMs / 1000).toFixed(1)}s | enriched=${enriched} (coords=${enrichedCoords} bldg=${enrichedBuildingInfo}) notFound=${notFound} errors=${errors}`,
  );
  return {
    attempted: slice.length,
    enriched,
    enrichedCoords,
    enrichedBuildingInfo,
    notFound,
    errors,
    durationMs,
  };
}
