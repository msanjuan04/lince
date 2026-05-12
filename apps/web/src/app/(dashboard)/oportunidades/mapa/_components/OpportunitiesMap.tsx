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

/**
 * Una `Property` confirmada con coordenadas reales. La página filtra antes de
 * pasarlas para que aquí podamos asumir lat/lng != null.
 */
type GeoProperty = Property & { lat: number; lng: number };

interface OpportunitiesMapProps {
  properties: GeoProperty[];
}

export function OpportunitiesMap({ properties }: OpportunitiesMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (properties.length === 0) return [41.3874, 2.1686];
    const lat = properties.reduce((a, p) => a + p.lat, 0) / properties.length;
    const lng = properties.reduce((a, p) => a + p.lng, 0) / properties.length;
    return [lat, lng];
  }, [properties]);

  if (properties.length === 0) {
    return (
      <div className="border-border bg-muted/30 flex h-[calc(100vh-12rem)] min-h-[500px] w-full items-center justify-center border">
        <div className="text-center">
          <p className="text-sm font-medium">Ninguna propiedad tiene coordenadas reales.</p>
          <p className="text-muted-foreground mt-1 text-xs">
            El mapa solo muestra inmuebles cuya fuente expuso lat/lng. Para BCN ciudad, estamos a la
            espera de integrar el geocoder de Catastro abierto (Fase 1.C).
          </p>
        </div>
      </div>
    );
  }

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
          const score = p.opportunityScore ?? 0;
          const radius = 6 + Math.min(8, Math.round(score / 12));
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
                    {p.opportunityScore !== null ? (
                      <ScoreBadge score={p.opportunityScore} size="sm" />
                    ) : (
                      <span className="text-muted-foreground text-xs">Score N/A</span>
                    )}
                    <SourceBadge source={p.source} />
                  </div>
                  <div>
                    <div className="font-medium">{p.address ?? '—'}</div>
                    <div className="text-muted-foreground text-xs">
                      {p.city ?? '—'} · {p.postalCode ?? '—'}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {p.type ? propertyTypeLabel(p.type) : '—'}
                    {p.m2 !== null ? <span> · {p.m2} m²</span> : null}
                    {p.rooms !== null && p.rooms > 0 ? <span> · {p.rooms} hab</span> : null}
                  </div>
                  <div className="border-border flex items-baseline justify-between border-t pt-2">
                    <span className="font-medium tabular-nums">
                      {p.price !== null ? formatEuros(p.price) : '—'}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {p.pricePerM2 !== null ? formatPricePerM2(p.pricePerM2) : '—'}
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
