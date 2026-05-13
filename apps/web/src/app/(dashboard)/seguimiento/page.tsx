import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '@/components/nav/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { StatusDot } from '@/components/shared/StatusDot';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { formatEuros, formatPricePerM2, formatRelativeDate } from '@/lib/format';
import { getOpportunities, getCurrentAgencyId } from '@/lib/data/repositories';
import {
  TRACK_STATUS_LABEL,
  TRACK_STATUS_TONE,
  getTracksMap,
  type PropertyTrackStatus,
} from '@/lib/data/tracking';
import { trackingRepo } from '@lince/db';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Mi seguimiento',
};

const STATUS_ORDER: PropertyTrackStatus[] = [
  'watching',
  'interested',
  'contacted',
  'viewed',
  'offering',
  'bought',
  'rejected',
];

export default async function SeguimientoPage() {
  const agencyId = await getCurrentAgencyId();
  const allOpps = await getOpportunities();
  const tracks = await getTracksMap(allOpps.map((p) => p.id));
  const counts = (await trackingRepo.getTrackStatusCounts(agencyId).catch(() => ({}))) as Record<
    string,
    number
  >;

  const tracked = allOpps
    .filter((p) => tracks.has(p.id))
    .map((p) => ({ property: p, track: tracks.get(p.id)! }))
    .sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.track.status);
      const ib = STATUS_ORDER.indexOf(b.track.status);
      if (ia !== ib) return ia - ib;
      return b.track.updatedAt.getTime() - a.track.updatedAt.getTime();
    });

  return (
    <>
      <Topbar
        title="Mi seguimiento"
        description="Tu cartera personal de oportunidades en gestión"
        meta={`${tracked.length} propiedades`}
      />

      <div className="flex flex-1 flex-col gap-10 p-6 sm:gap-12 sm:p-10">
        <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <StatCard label="Vigilando" value={counts['watching'] ?? 0} emphasized />
          <StatCard label="Interesado" value={counts['interested'] ?? 0} />
          <StatCard label="Contactadas" value={counts['contacted'] ?? 0} />
          <StatCard label="Visitadas" value={counts['viewed'] ?? 0} />
          <StatCard label="Negociando" value={counts['offering'] ?? 0} />
          <StatCard label="Adquiridas" value={counts['bought'] ?? 0} hint="en tu portfolio" />
          <StatCard label="Descartadas" value={counts['rejected'] ?? 0} />
          <StatCard label="Total" value={tracked.length} />
        </section>

        <section className="flex flex-col gap-5">
          <header>
            <h2 className="text-base font-medium tracking-[-0.02em]">Cartera</h2>
            <p className="text-muted-foreground text-sm">
              Agrupadas por estado, más recientes arriba en cada grupo.
            </p>
          </header>

          {tracked.length === 0 ? (
            <div className="border-border flex flex-col items-center justify-center gap-3 border py-20 text-center">
              <div className="border-border size-10 border" aria-hidden />
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">Aún no estás siguiendo ninguna oportunidad</h3>
                <p className="text-muted-foreground max-w-md text-sm">
                  En{' '}
                  <Link href="/oportunidades" className="underline">
                    /oportunidades
                  </Link>
                  , abre cualquier ficha y marca el estado para empezar a llevar tu seguimiento
                  aquí.
                </p>
              </div>
            </div>
          ) : (
            <div className="border-border border-t">
              {tracked.map(({ property, track }) => {
                const targetDelta =
                  property.price != null && track.targetPriceEur != null && property.price > 0
                    ? ((property.price - track.targetPriceEur) / property.price) * 100
                    : null;
                return (
                  <Link
                    key={property.id}
                    href={`/oportunidades?selected=${property.id}`}
                    className="border-border hover:bg-accent/30 flex flex-col gap-3 border-b px-1 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <StatusDot
                        label={TRACK_STATUS_LABEL[track.status]}
                        tone={TRACK_STATUS_TONE[track.status]}
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="line-clamp-1 text-sm font-medium">
                          {property.address ?? '—'}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {property.city ?? '—'}
                          {property.postalCode ? ` · CP ${property.postalCode}` : ''}
                          {property.type ? ` · ${propertyTypeLabel(property.type)}` : ''}
                          {property.m2 != null ? ` · ${property.m2} m²` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-6 sm:justify-end">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm font-medium tabular-nums">
                          {property.price != null ? formatEuros(property.price) : '—'}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {property.pricePerM2 != null
                            ? formatPricePerM2(property.pricePerM2)
                            : '—'}
                        </span>
                      </div>
                      {track.targetPriceEur != null ? (
                        <div className="flex w-28 flex-col items-end gap-0.5">
                          <span className="text-foreground text-sm font-medium tabular-nums">
                            {formatEuros(track.targetPriceEur)}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] tabular-nums',
                              targetDelta !== null && targetDelta >= 10
                                ? 'text-highlight'
                                : 'text-muted-foreground',
                            )}
                          >
                            mi oferta
                            {targetDelta !== null
                              ? ` · −${Math.abs(Math.round(targetDelta))}%`
                              : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40 w-28 text-right text-xs">
                          sin oferta
                        </span>
                      )}
                      <SourceBadge source={property.source} className="w-20" />
                      <span className="text-muted-foreground hidden text-right text-xs sm:inline-block sm:w-20">
                        {formatRelativeDate(track.updatedAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
