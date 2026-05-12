'use client';

import dynamic from 'next/dynamic';
import type { Property } from '@/lib/data/types';

type GeoProperty = Property & { lat: number; lng: number };

const OpportunitiesMap = dynamic(
  () => import('./OpportunitiesMap').then((m) => m.OpportunitiesMap),
  { ssr: false, loading: () => <MapSkeleton /> },
);

function MapSkeleton() {
  return (
    <div className="border-border bg-muted/30 flex h-[calc(100vh-12rem)] min-h-[500px] w-full items-center justify-center border">
      <span className="text-muted-foreground text-sm">Cargando mapa…</span>
    </div>
  );
}

export function MapClientWrapper({ properties }: { properties: GeoProperty[] }) {
  return <OpportunitiesMap properties={properties} />;
}
