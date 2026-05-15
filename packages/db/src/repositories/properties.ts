// Upsert idempotente por (source, source_id). Devuelve la fila y un flag
// `isNew` para que el orquestador del crawler pueda contar nuevas vs actualizadas.

import { Prisma, prisma } from '../index';

export type PropertyUpsertInput = {
  source: string;
  sourceId: string;
  sourceUrl?: string | null;
  type?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  cadastralRef?: string | null;
  m2?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  yearBuilt?: number | null;
  price?: number | null;
  pricePerM2?: number | null;
  status?: string | null;
  description?: string | null;
  descriptionHash?: string | null;
  hasTerrace?: boolean | null;
  hasElevator?: boolean | null;
  floor?: string | null;
  orientation?: string | null;
  condition?: string | null;
  isBankOwned?: boolean | null;
  isAuction?: boolean | null;
  auctionStartingPrice?: number | null;
  redFlags?: string[];
  mainImageUrl?: string | null;
  rawData?: Prisma.InputJsonValue | null;
};

export type UpsertResult = {
  id: string;
  isNew: boolean;
  priceChanged: boolean;
  descriptionChanged: boolean;
  previousPrice: number | null;
  previousDescriptionHash: string | null;
};

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

/**
 * Algunas fuentes (Aliseda, Solvia) exponen el precio anterior cuando la
 * propiedad ha sido rebajada. Si tenemos ese campo y es mayor que el precio
 * actual, sabemos que hubo una rebaja antes de que Lince viera la propiedad —
 * la registramos como fila inicial en `price_history` para que el agregador
 * reporte `dropCount=1`.
 */
function extractSourceReportedPreviousPrice(
  rawData: Prisma.InputJsonValue | null | undefined,
): number | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const obj = rawData as Record<string, unknown>;
  // Aliseda: PrecioAnterior (camelCase desde nuestro adapter al sub-objeto operacion).
  if (typeof obj.PrecioAnterior === 'number' && obj.PrecioAnterior > 0) {
    return obj.PrecioAnterior;
  }
  // Solvia: precioAntes (numérico directo). Si es 0 lo descartamos — Solvia
  // usa 0 como "no aplica".
  if (typeof obj.precioAntes === 'number' && obj.precioAntes > 0) {
    return obj.precioAntes;
  }
  return null;
}

/** Upsert por (source, sourceId). Devuelve diff útil para el histórico (Fase 2). */
export async function upsertProperty(input: PropertyUpsertInput): Promise<UpsertResult> {
  const now = new Date();
  const existing = await prisma.property.findUnique({
    where: { source_sourceId: { source: input.source, sourceId: input.sourceId } },
    select: { id: true, price: true, descriptionHash: true },
  });

  const data = {
    sourceUrl: input.sourceUrl ?? null,
    type: input.type ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    postalCode: input.postalCode ?? null,
    province: input.province ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    cadastralRef: input.cadastralRef ?? null,
    m2: input.m2 ?? null,
    rooms: input.rooms ?? null,
    bathrooms: input.bathrooms ?? null,
    yearBuilt: input.yearBuilt ?? null,
    price: toDecimal(input.price),
    pricePerM2: toDecimal(input.pricePerM2),
    status: input.status ?? null,
    description: input.description ?? null,
    descriptionHash: input.descriptionHash ?? null,
    hasTerrace: input.hasTerrace ?? null,
    hasElevator: input.hasElevator ?? null,
    floor: input.floor ?? null,
    orientation: input.orientation ?? null,
    condition: input.condition ?? null,
    isBankOwned: input.isBankOwned ?? null,
    isAuction: input.isAuction ?? null,
    auctionStartingPrice: toDecimal(input.auctionStartingPrice),
    redFlags: input.redFlags ?? [],
    mainImageUrl: input.mainImageUrl ?? null,
    rawData: input.rawData ?? Prisma.JsonNull,
    lastSeen: now,
  } satisfies Prisma.PropertyUpdateInput;

  if (!existing) {
    const created = await prisma.property.create({
      data: {
        ...data,
        source: input.source,
        sourceId: input.sourceId,
        firstSeen: now,
      },
    });
    // Punto cero del histórico + posible rebaja reportada por la fuente
    // (Aliseda: PrecioAnterior · Solvia: precioAntes). Esto distingue entre
    // "Lince observó cambio entre 2 runs" y "la fuente ya tenía rebaja antes
    // de que Lince la viera". Ambas filas con observedAt=now por consistencia,
    // el caller distingue tipo de rebaja por `oldPrice IS NOT NULL` y la
    // proximidad a `firstSeen` del Property.
    if (input.price !== undefined && input.price !== null) {
      const sourceReportedPrevPrice = extractSourceReportedPreviousPrice(input.rawData);
      if (sourceReportedPrevPrice !== null && sourceReportedPrevPrice > input.price) {
        const deltaPct = (input.price - sourceReportedPrevPrice) / sourceReportedPrevPrice;
        await prisma.priceHistory.create({
          data: {
            propertyId: created.id,
            oldPrice: toDecimal(sourceReportedPrevPrice),
            newPrice: toDecimal(input.price)!,
            deltaPct: toDecimal(Math.round(deltaPct * 10000) / 100),
            observedAt: now,
          },
        });
      } else {
        await prisma.priceHistory.create({
          data: {
            propertyId: created.id,
            oldPrice: null,
            newPrice: toDecimal(input.price)!,
            deltaPct: null,
            observedAt: now,
          },
        });
      }
    }
    return {
      id: created.id,
      isNew: true,
      priceChanged: false,
      descriptionChanged: false,
      previousPrice: null,
      previousDescriptionHash: null,
    };
  }

  const updated = await prisma.property.update({
    where: { id: existing.id },
    data,
  });

  const prevPrice = existing.price ? existing.price.toNumber() : null;
  const newPrice = input.price ?? null;
  const priceChanged =
    prevPrice !== null && newPrice !== null && Math.abs(prevPrice - newPrice) > 0.01;
  const descriptionChanged =
    !!existing.descriptionHash &&
    !!input.descriptionHash &&
    existing.descriptionHash !== input.descriptionHash;

  // Persistir el diff en histórico cuando aplique. Los inserts son ligeros y
  // permiten reconstruir la línea de tiempo completa de la propiedad.
  if (priceChanged && newPrice !== null && prevPrice !== null) {
    const deltaPct = (newPrice - prevPrice) / prevPrice;
    await prisma.priceHistory.create({
      data: {
        propertyId: existing.id,
        oldPrice: toDecimal(prevPrice),
        newPrice: toDecimal(newPrice)!,
        deltaPct: toDecimal(Math.round(deltaPct * 10000) / 100), // %, 2 decimales
        observedAt: now,
      },
    });
  }

  if (descriptionChanged && input.descriptionHash) {
    const snippet = input.description ? input.description.slice(0, 500) : null;
    await prisma.descriptionHistory.create({
      data: {
        propertyId: existing.id,
        oldHash: existing.descriptionHash,
        newHash: input.descriptionHash,
        snippet,
        observedAt: now,
      },
    });
  }

  return {
    id: updated.id,
    isNew: false,
    priceChanged,
    descriptionChanged,
    previousPrice: prevPrice,
    previousDescriptionHash: existing.descriptionHash,
  };
}
