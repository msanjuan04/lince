import type { Metadata } from 'next';
import { Topbar } from '@/components/nav/Topbar';
import { getOpportunitiesForMap } from '@/lib/data/repositories';
import { MapClientWrapper } from './_components/MapClientWrapper';

export const metadata: Metadata = {
  title: 'Mapa de oportunidades',
};

export default async function MapaPage() {
  const properties = await getOpportunitiesForMap();

  const auctions = properties.filter((p) => p.source === 'boe').length;
  const bankOwned = properties.filter((p) =>
    ['solvia', 'aliseda', 'sareb', 'haya', 'casaktua', 'anida'].includes(p.source),
  ).length;
  const portals = properties.length - auctions - bankOwned;

  return (
    <>
      <Topbar
        title="Mapa de oportunidades"
        description="Vista geográfica del inventario activo en Catalunya"
        meta={`${properties.length} ubicaciones`}
      />

      <div className="flex flex-1 flex-col gap-4 p-6 sm:p-10">
        <div className="flex items-center gap-4 text-xs">
          <Legend color="#475569" label={`Portales (${portals})`} />
          <Legend color="#1e293b" label={`Bank-owned (${bankOwned})`} />
          <Legend color="#b45309" label={`Subastas BOE (${auctions})`} />
          <span className="text-muted-foreground ml-auto hidden sm:inline">
            Tamaño del círculo proporcional al score
          </span>
        </div>

        <MapClientWrapper properties={properties} />
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block size-3 rounded-full"
        style={{ background: color, border: '1.5px solid white', outline: '1px solid #d4d4d4' }}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
