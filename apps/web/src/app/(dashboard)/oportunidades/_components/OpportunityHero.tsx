'use client';

import { ArrowUpRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { Button } from '@/components/ui/button';
import { formatEuros, formatM2, formatPricePerM2, formatRelativeDate } from '@/lib/format';
import type { Property } from '@/lib/data/types';

interface OpportunityHeroProps {
  property: Property;
}

export function OpportunityHero({ property }: OpportunityHeroProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const discountPct = property.zoneDeltaPct;

  function open() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', property.id);
    router.push(`/oportunidades?${params.toString()}`, { scroll: false });
  }

  return (
    <section className="border-foreground border-t pt-6">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-muted-foreground text-xs">Oportunidad destacada · Hoy</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {formatRelativeDate(property.firstSeen)}
        </span>
      </div>
      <button
        type="button"
        onClick={open}
        className="hover:bg-accent/40 group -mx-2 grid w-[calc(100%+1rem)] grid-cols-1 items-end gap-6 rounded-sm px-2 py-4 text-left transition-colors lg:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <div className="flex flex-col gap-2">
          {property.opportunityScore !== null ? (
            <ScoreBadge score={property.opportunityScore} size="lg" />
          ) : null}
          <h2 className="text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
            {property.address ?? '—'}
          </h2>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm">
            <span>
              {property.city ?? '—'}
              {property.postalCode ? (
                <span className="font-mono text-xs tabular-nums"> · {property.postalCode}</span>
              ) : null}
            </span>
            {property.type ? (
              <>
                <span aria-hidden>·</span>
                <span>{propertyTypeLabel(property.type)}</span>
              </>
            ) : null}
            {property.m2 !== null ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{formatM2(property.m2)}</span>
              </>
            ) : null}
            {property.rooms !== null && property.rooms > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{property.rooms} hab</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <SourceBadge source={property.source} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Precio</span>
          <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">
            {property.price !== null ? formatEuros(property.price) : '—'}
          </span>
          <span className="text-muted-foreground text-xs">
            {property.pricePerM2 !== null ? formatPricePerM2(property.pricePerM2) : '—'}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">vs zona</span>
          {discountPct !== null && property.zoneAvgPricePerM2 !== null ? (
            <>
              <span
                className={
                  discountPct > 0
                    ? 'text-highlight text-2xl font-medium tabular-nums tracking-[-0.02em]'
                    : 'text-muted-foreground text-2xl font-medium tabular-nums tracking-[-0.02em]'
                }
              >
                {discountPct >= 0 ? '−' : '+'}
                {Math.abs(Math.round(discountPct * 100))}%
              </span>
              <span className="text-muted-foreground text-xs">
                zona: {formatPricePerM2(property.zoneAvgPricePerM2)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">Muestra insuficiente en CP</span>
          )}
        </div>

        <div className="hidden lg:block">
          <Button variant="outline" size="sm" className="gap-1.5">
            Ver detalle
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Button>
        </div>
      </button>
    </section>
  );
}
