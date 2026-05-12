import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/nav/Topbar';
import {
  getOpportunities,
  getOpportunityStats,
  getPropertyById,
  getPropertyHistory,
} from '@/lib/data/repositories';
import { getPropertyTrack, getTracksMap } from '@/lib/data/tracking';
import type { OpportunityFilters } from '@/lib/data/repositories';
import type { PropertyType } from '@/lib/data/types';
import { OpportunitiesView } from './_components/OpportunitiesView';
import { OpportunityHero } from './_components/OpportunityHero';
import { OpportunityStatsRow } from './_components/OpportunityStatsRow';

export const metadata: Metadata = {
  title: 'Oportunidades',
};

const VALID_TYPES: PropertyType[] = ['piso', 'casa', 'atico', 'duplex', 'local', 'terreno'];

interface PageProps {
  searchParams: Promise<{
    q?: string;
    cp?: string;
    score?: string;
    type?: string;
    maxPrice?: string;
    minRooms?: string;
    selected?: string;
  }>;
}

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters: OpportunityFilters = {};
  if (params.q) filters.search = params.q;
  if (params.cp) filters.postalCodes = params.cp.split(',').filter(Boolean);
  if (params.score) {
    const min = Number(params.score);
    if (!Number.isNaN(min)) filters.minScore = min;
  }
  if (params.type) {
    const types = params.type
      .split(',')
      .filter((t): t is PropertyType => VALID_TYPES.includes(t as PropertyType));
    if (types.length > 0) filters.types = types;
  }
  if (params.maxPrice) {
    const max = Number(params.maxPrice);
    if (!Number.isNaN(max)) filters.maxPrice = max;
  }
  if (params.minRooms) {
    const rooms = Number(params.minRooms);
    if (!Number.isNaN(rooms)) filters.minRooms = rooms;
  }

  const [items, stats] = await Promise.all([getOpportunities(filters), getOpportunityStats()]);

  const selected = params.selected ? await getPropertyById(params.selected) : null;
  if (params.selected && !selected) notFound();
  const selectedHistory = selected ? await getPropertyHistory(selected.id) : [];
  const selectedTrack = selected ? await getPropertyTrack(selected.id) : null;
  const tracksMap = await getTracksMap(items.map((p) => p.id));

  const hero = items[0] ?? null;
  const rest = items.slice(1);
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <>
      <Topbar
        title="Oportunidades"
        description="Inmuebles detectados por debajo del precio de mercado"
        meta={`${items.length.toString().padStart(2, '0')} / ${stats.total} activas`}
      />
      <div className="flex flex-1 flex-col gap-10 p-6 sm:gap-12 sm:p-10">
        <OpportunityStatsRow stats={stats} />

        {hero && !hasFilters ? <OpportunityHero property={hero} /> : null}

        <OpportunitiesView
          properties={hasFilters ? items : rest}
          selected={selected}
          selectedHistory={selectedHistory}
          selectedTrack={selectedTrack}
          trackedIds={Array.from(tracksMap.keys())}
          heroLabel={hasFilters ? 'Resultados' : 'Resto del inventario'}
          totalLabel={hasFilters ? `${items.length} resultados` : `${rest.length} inmuebles`}
        />
      </div>
    </>
  );
}
