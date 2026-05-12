'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import type { Property } from '@/lib/data/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { formatEuros, formatPricePerM2 } from '@/lib/format';

interface OpportunitiesMapProps {
  properties: Property[];
}

/**
 * Mapa Leaflet con un CircleMarker por propiedad, coloreado por bucket.
 * Marker pulsando para subastas (Bucket B), terraza para premium oculto, etc.
 * Click → popup con datos clave + link al detalle.
 */
export function OpportunitiesMap({ properties }: OpportunitiesMapProps) {
  // Centro: media de coordenadas (o Barcelona si no hay datos)
  const center = useMemo<[number, number]>(() => {
    if (properties.length === 0) return [41.3874, 2.1686];
    const lat = properties.reduce((a, p) => a + p.lat, 0) / properties.length;
    const lng = properties.reduce((a, p) => a + p.lng, 0) / properties.length;
    return [lat, lng];
  }, [properties]);

  return (
    <div className="border-border h-[calc(100vh-12rem)] min-h-[500px] w-full overflow-hidden border">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: '#f7f7f7' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {properties.map((p) => {
          const isAuction = p.source === 'boe';
          const isBankOwned = ['solvia', 'aliseda', 'sareb', 'haya', 'casaktua', 'anida'].includes(
            p.source,
          );
          const fill = isAuction ? '#b45309' : isBankOwned ? '#1e293b' : '#475569';
          const radius = 6 + Math.min(8, Math.round(p.opportunityScore / 12));
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={radius}
              pathOptions={{
                color: '#ffffff',
                weight: 1.5,
                fillColor: fill,
                fillOpacity: 0.85,
              }}
            >
              <Popup minWidth={240}>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <ScoreBadge score={p.opportunityScore} size="sm" />
                    <SourceBadge source={p.source} />
                  </div>
                  <div>
                    <div className="font-medium">{p.address}</div>
                    <div className="text-muted-foreground text-xs">
                      {p.city} · {p.postalCode}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {propertyTypeLabel(p.type)}
                    {p.m2 > 0 ? <span> · {p.m2} m²</span> : null}
                    {p.rooms > 0 ? <span> · {p.rooms} hab</span> : null}
                  </div>
                  <div className="border-border flex items-baseline justify-between border-t pt-2">
                    <span className="font-medium tabular-nums">{formatEuros(p.price)}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatPricePerM2(p.pricePerM2)}
                    </span>
                  </div>
                  <Link
                    href={`/oportunidades?selected=${p.id}`}
                    className="text-foreground text-xs font-medium hover:underline"
                  >
                    Ver ficha completa →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
