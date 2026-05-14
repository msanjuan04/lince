'use client';

import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatEuros,
  formatEurosCompact,
  formatPricePerM2,
  formatRelativeDate,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/data/types';

interface OpportunityTableProps {
  properties: Property[];
  trackedSet: Set<string>;
  onSelect: (id: string) => void;
}

export function OpportunityTable({ properties, trackedSet, onSelect }: OpportunityTableProps) {
  if (properties.length === 0) {
    return (
      <div className="border-border flex flex-col items-center justify-center gap-3 border py-16 text-center">
        <div className="border-border size-10 border" aria-hidden />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Sin coincidencias</h3>
          <p className="text-muted-foreground max-w-sm text-sm">
            Prueba a relajar los filtros o ampliar el rango de precio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border overflow-x-auto border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-10 w-[80px] pl-0 text-xs font-normal">
              Score
            </TableHead>
            <TableHead className="text-muted-foreground h-10 text-xs font-normal">
              Inmueble
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-10 text-xs font-normal md:table-cell">
              Tipo · Tamaño
            </TableHead>
            <TableHead className="text-muted-foreground h-10 text-right text-xs font-normal">
              Precio
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-10 text-right text-xs font-normal lg:table-cell">
              €/m²
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-10 text-right text-xs font-normal lg:table-cell">
              vs zona
            </TableHead>
            <TableHead
              className="text-muted-foreground hidden h-10 text-right text-xs font-normal xl:table-cell"
              title="Inversión total estimada (compra + ITP + notaría + reforma)"
            >
              Inversión
            </TableHead>
            <TableHead
              className="text-muted-foreground hidden h-10 text-right text-xs font-normal xl:table-cell"
              title="Margen bruto estimado del flip"
            >
              Margen flip
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-10 text-xs font-normal md:table-cell">
              Fuente
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-10 pr-0 text-right text-xs font-normal sm:table-cell">
              Visto
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((p) => (
            <PropertyRow
              key={p.id}
              property={p}
              isTracked={trackedSet.has(p.id)}
              onSelect={onSelect}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PropertyRow({
  property,
  isTracked,
  onSelect,
}: {
  property: Property;
  isTracked: boolean;
  onSelect: (id: string) => void;
}) {
  const discountPct = property.zoneDeltaPct;
  const discountLabel =
    discountPct === null
      ? '—'
      : `${discountPct >= 0 ? '−' : '+'}${Math.abs(Math.round(discountPct * 100))}%`;

  return (
    <TableRow
      onClick={() => onSelect(property.id)}
      className="hover:bg-accent/40 group h-14 cursor-pointer transition-colors"
    >
      <TableCell className="pl-0">
        {property.opportunityScore !== null ? (
          <ScoreBadge score={property.opportunityScore} />
        ) : (
          <span className="text-muted-foreground/60 text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="line-clamp-1 text-sm font-medium">
            {isTracked ? (
              <span
                aria-label="En seguimiento"
                title="En seguimiento"
                className="bg-highlight mr-1.5 inline-block size-1.5 rounded-full align-middle"
              />
            ) : null}
            {property.address ?? '—'}
          </span>
          <span className="text-muted-foreground text-xs">
            {property.city ?? '—'}
            {property.postalCode ? (
              <span className="ml-1.5 font-mono tabular-nums">· {property.postalCode}</span>
            ) : null}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
        <span className="text-foreground">
          {property.type ? propertyTypeLabel(property.type) : '—'}
        </span>
        {property.m2 !== null ? (
          <span className="ml-2 tabular-nums">
            {property.m2}
            <span className="text-muted-foreground/60"> m²</span>
          </span>
        ) : null}
        {property.rooms !== null && property.rooms > 0 ? (
          <span className="ml-2 tabular-nums">
            {property.rooms}
            <span className="text-muted-foreground/60"> hab</span>
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right text-sm font-medium tabular-nums">
        {property.price !== null ? formatEuros(property.price) : '—'}
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-right text-sm tabular-nums lg:table-cell">
        {property.pricePerM2 !== null ? formatPricePerM2(property.pricePerM2) : '—'}
      </TableCell>
      <TableCell className="hidden text-right text-sm tabular-nums lg:table-cell">
        <span
          className={cn(
            'font-medium',
            discountPct !== null && discountPct >= 0.2
              ? 'text-highlight'
              : discountPct !== null && discountPct >= 0
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {discountLabel}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-right text-sm tabular-nums xl:table-cell">
        {property.flipEstimate?.totalInvestment !== null &&
        property.flipEstimate?.totalInvestment !== undefined
          ? formatEurosCompact(property.flipEstimate.totalInvestment)
          : '—'}
      </TableCell>
      <TableCell className="hidden text-right text-sm tabular-nums xl:table-cell">
        {property.flipEstimate?.grossMarginEur !== null &&
        property.flipEstimate?.grossMarginEur !== undefined ? (
          <div className="flex flex-col items-end leading-tight">
            <span
              className={cn(
                'font-medium',
                property.flipEstimate.grossMarginEur >= 50_000
                  ? 'text-highlight'
                  : property.flipEstimate.grossMarginEur > 0
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {formatEurosCompact(property.flipEstimate.grossMarginEur)}
            </span>
            {property.flipEstimate.grossMarginPct !== null ? (
              <span className="text-muted-foreground/70 text-[10px]">
                {(property.flipEstimate.grossMarginPct * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <SourceBadge source={property.source} />
      </TableCell>
      <TableCell className="text-muted-foreground hidden pr-0 text-right text-xs sm:table-cell">
        {formatRelativeDate(property.firstSeen)}
      </TableCell>
    </TableRow>
  );
}
