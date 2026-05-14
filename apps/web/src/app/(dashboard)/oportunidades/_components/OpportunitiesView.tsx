'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { PriceHistoryEntry, Property } from '@/lib/data/types';
import type { PropertyTrack } from '@/lib/data/tracking-types';
import { OpportunityFilters } from './OpportunityFilters';
import { OpportunityTable } from './OpportunityTable';
import { OpportunityDetailSheet } from './OpportunityDetailSheet';
import { FlipFilters, DEFAULT_FLIP_FILTERS, type FlipFilterState } from './FlipFilters';
import { useFlipPipeline } from './useFlipPipeline';

interface OpportunitiesViewProps {
  properties: Property[];
  selected: Property | null;
  selectedHistory: PriceHistoryEntry[];
  selectedTrack: PropertyTrack | null;
  trackedIds: string[];
  heroLabel: string;
  totalLabel: string;
}

export function OpportunitiesView({
  properties,
  selected,
  selectedHistory,
  selectedTrack,
  trackedIds,
  heroLabel,
  totalLabel,
}: OpportunitiesViewProps) {
  const trackedSet = new Set(trackedIds);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Filtros flip — state local cliente. No tocan el server.
  const [flipFilters, setFlipFilters] = useState<FlipFilterState>(() => ({
    ...DEFAULT_FLIP_FILTERS,
    tiers: new Set(DEFAULT_FLIP_FILTERS.tiers),
  }));
  const { filtered, total, passedFilters } = useFlipPipeline(properties, flipFilters);

  // Si hay un selected, debe seguir visible aunque no pase los filtros (la
  // ficha está abierta). Si no, sustituye properties por filtered.
  const visibleProperties = useMemo(() => {
    if (!selected) return filtered;
    if (filtered.some((p) => p.id === selected.id)) return filtered;
    return [selected, ...filtered];
  }, [filtered, selected]);

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('selected', id);
      else params.delete('selected');
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `/oportunidades?${qs}` : '/oportunidades', { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Atajo `Esc` cierra el drawer
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') select(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, select]);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-medium tracking-[-0.02em]">{heroLabel}</h2>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {passedFilters} / {total} tras filtros flip · {totalLabel}
        </span>
      </header>
      <OpportunityFilters />
      <FlipFilters state={flipFilters} onChange={setFlipFilters} />
      <OpportunityTable properties={visibleProperties} trackedSet={trackedSet} onSelect={select} />
      <OpportunityDetailSheet
        property={selected}
        history={selectedHistory}
        track={selectedTrack}
        open={selected !== null}
        onClose={() => select(null)}
      />
    </section>
  );
}
