'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useTransition } from 'react';
import type { PriceHistoryEntry, Property } from '@/lib/data/types';
import { OpportunityFilters } from './OpportunityFilters';
import { OpportunityTable } from './OpportunityTable';
import { OpportunityDetailSheet } from './OpportunityDetailSheet';

interface OpportunitiesViewProps {
  properties: Property[];
  selected: Property | null;
  selectedHistory: PriceHistoryEntry[];
  heroLabel: string;
  totalLabel: string;
}

export function OpportunitiesView({
  properties,
  selected,
  selectedHistory,
  heroLabel,
  totalLabel,
}: OpportunitiesViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{totalLabel}</span>
      </header>
      <OpportunityFilters />
      <OpportunityTable properties={properties} onSelect={select} />
      <OpportunityDetailSheet
        property={selected}
        history={selectedHistory}
        open={selected !== null}
        onClose={() => select(null)}
      />
    </section>
  );
}
