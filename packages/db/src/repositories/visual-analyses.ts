// Persistencia de análisis visuales hechos por Claude Vision. Cada propiedad
// puede tener N análisis a lo largo del tiempo (re-análisis con prompt mejorado,
// foto cambiada). El sistema lee siempre el más reciente.

import { Prisma, prisma } from '../index';

export interface CreateVisualAnalysisInput {
  propertyId: string;
  imageUrl: string;
  modelId: string;
  promptVersion: string;
  conditionScore: number | null;
  conditionLabel: string | null;
  reformCostPerM2: number | null;
  elementsToReform: string[];
  visualRedFlags: string[];
  photoQuality: string | null;
  summary: string | null;
  rawResponse: unknown;
  tokensIn: number;
  tokensOut: number;
  costEur: number;
}

export async function createVisualAnalysis(input: CreateVisualAnalysisInput) {
  return prisma.propertyVisualAnalysis.create({
    data: {
      propertyId: input.propertyId,
      imageUrl: input.imageUrl,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      conditionScore: input.conditionScore,
      conditionLabel: input.conditionLabel,
      reformCostPerM2:
        input.reformCostPerM2 !== null ? new Prisma.Decimal(input.reformCostPerM2) : null,
      elementsToReform: input.elementsToReform,
      visualRedFlags: input.visualRedFlags,
      photoQuality: input.photoQuality,
      summary: input.summary,
      rawResponse: input.rawResponse as Prisma.InputJsonValue,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costEur: new Prisma.Decimal(input.costEur),
    },
  });
}

/** Último análisis para una propiedad. Null si no hay ninguno. */
export async function getLatestVisualAnalysis(propertyId: string) {
  return prisma.propertyVisualAnalysis.findFirst({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
  });
}

/** Mapa propertyId → último análisis, para un batch de IDs. */
export async function getLatestVisualAnalysesByIds(propertyIds: string[]) {
  if (propertyIds.length === 0)
    return new Map<string, Awaited<ReturnType<typeof getLatestVisualAnalysis>>>();
  const rows = await prisma.$queryRaw<
    Array<{
      property_id: string;
      analysis_id: string;
    }>
  >`
    SELECT DISTINCT ON (property_id) property_id, id AS analysis_id
    FROM property_visual_analyses
    WHERE property_id = ANY(${propertyIds}::uuid[])
    ORDER BY property_id, created_at DESC
  `;
  const analyses = await prisma.propertyVisualAnalysis.findMany({
    where: { id: { in: rows.map((r) => r.analysis_id) } },
  });
  const byPropertyId = new Map(analyses.map((a) => [a.propertyId, a]));
  return byPropertyId;
}

/** Propiedades que NO tienen ningún análisis visual todavía. Para el job batch. */
export async function getPropertiesPendingAnalysis(opts: {
  limit?: number;
  minScore?: number;
}): Promise<
  Array<{
    id: string;
    mainImageUrl: string;
    postalCode: string | null;
    m2: number | null;
    yearBuilt: number | null;
    source: string;
  }>
> {
  return prisma.$queryRaw`
    SELECT p.id, p.main_image_url AS "mainImageUrl", p.postal_code AS "postalCode",
           p.m2, p.year_built AS "yearBuilt", p.source
    FROM properties p
    LEFT JOIN property_visual_analyses pva ON pva.property_id = p.id
    WHERE p.main_image_url IS NOT NULL
      AND pva.id IS NULL
      ${opts.minScore !== undefined ? Prisma.sql`AND COALESCE(p.opportunity_score, 0) >= ${opts.minScore}` : Prisma.empty}
    ORDER BY p.opportunity_score DESC NULLS LAST, p.first_seen DESC
    LIMIT ${opts.limit ?? 20}
  `;
}
