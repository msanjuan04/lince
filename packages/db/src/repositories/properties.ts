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

  return {
    id: updated.id,
    isNew: false,
    priceChanged,
    descriptionChanged,
    previousPrice: prevPrice,
    previousDescriptionHash: existing.descriptionHash,
  };
}
