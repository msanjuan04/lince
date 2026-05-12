import type { Metadata } from 'next';
import { Topbar } from '@/components/nav/Topbar';
import { getOpportunitiesForMap } from '@/lib/data/repositories';
import type { Property } from '@/lib/data/types';
import { MapClientWrapper } from './_components/MapClientWrapper';

export const metadata: Metadata = {
  title: 'Mapa de oportunidades',
};

type GeoProperty = Property & { lat: number; lng: number };

export default async function MapaPage() {
  const { properties, withoutGeo } = await getOpportunitiesForMap();

  // El query ya filtra a propiedades con lat/lng != null; refinamos el tipo.
  const geoProperties = properties.filter(
    (p): p is GeoProperty => p.lat !== null && p.lng !== null,
  );

  const auctions = geoProperties.filter((p) => p.source === 'boe').length;
  const bankOwned = geoProperties.filter((p) =>
    ['solvia', 'aliseda', 'sareb', 'haya', 'casaktua', 'anida'].includes(p.source),
  ).length;
  const portals = geoProperties.length - auctions - bankOwned;

  return (
    <>
      <Topbar
        title="Mapa de oportunidades"
        description="Vista geográfica del inventario activo en Catalunya"
        meta={
          withoutGeo > 0
            ? `${geoProperties.length} en mapa · ${withoutGeo} sin geolocalización`
            : `${geoProperties.length} en mapa`
        }
      />

      <div className="flex flex-1 flex-col gap-4 p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <Legend color="#475569" label={`Portales (${portals})`} />
          <Legend color="#1e293b" label={`Bank-owned (${bankOwned})`} />
          <Legend color="#b45309" label={`Subastas BOE (${auctions})`} />
          {withoutGeo > 0 ? (
            <span className="text-muted-foreground">
              {withoutGeo} sin geolocalización (no se muestran)
            </span>
          ) : null}
          <span className="text-muted-foreground ml-auto hidden sm:inline">
            Tamaño del círculo proporcional al score
          </span>
        </div>

        <MapClientWrapper properties={geoProperties} />
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
