import { Sparkles } from 'lucide-react';
import { StatusDot } from '@/components/shared/StatusDot';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatEuros, formatM2, formatNumber, formatRelativeDate } from '@/lib/format';
import type { Listing, ListingStatus } from '@/lib/data/types';

const STATUS_LABEL: Record<ListingStatus, string> = {
  draft: 'Borrador',
  live: 'En vivo',
  sold: 'Vendido',
  withdrawn: 'Retirado',
};

const STATUS_TONE: Record<ListingStatus, 'default' | 'highlight' | 'mute'> = {
  draft: 'mute',
  live: 'highlight',
  sold: 'default',
  withdrawn: 'mute',
};

const PORTAL_LABEL: Record<string, string> = {
  idealista: 'Idealista',
  fotocasa: 'Fotocasa',
  habitaclia: 'Habitaclia',
  'web-propia': 'Web propia',
};

export function ListingsGrid({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return (
      <div className="border-border flex flex-col items-center justify-center gap-3 border py-20 text-center">
        <div className="border-border size-10 border" aria-hidden />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Aún no has publicado ningún listing</h3>
          <p className="text-muted-foreground max-w-sm text-sm">
            Cuando firmes una captura, podrás convertirla en listing y distribuirla a portales.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-px overflow-hidden border md:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const { property } = listing;
  const hasStaging = listing.stagingPhotos.length > 0;
  return (
    <article className="bg-card flex flex-col gap-5 p-6">
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground font-mono text-[10px] uppercase tabular-nums">
          {listing.id}
        </span>
        <StatusDot label={STATUS_LABEL[listing.status]} tone={STATUS_TONE[listing.status]} />
      </header>

      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-1 text-base font-medium tracking-[-0.02em]">
          {property.address}
        </h3>
        <p className="text-muted-foreground text-xs">
          {property.city ?? '—'}
          {property.postalCode ? (
            <span className="ml-1 font-mono tabular-nums">· {property.postalCode}</span>
          ) : null}
          <span className="ml-2">
            {property.type ? `· ${propertyTypeLabel(property.type)} ` : ''}
            {property.m2 !== null ? `· ${formatM2(property.m2)}` : ''}
            {property.rooms !== null && property.rooms > 0 ? ` · ${property.rooms} hab` : ''}
          </span>
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">
          {formatEuros(listing.price)}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatRelativeDate(listing.createdAt)}
        </span>
      </div>

      <Separator />

      <div className="flex flex-col gap-2 text-xs">
        <div className="text-muted-foreground">Distribuido a</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {listing.distributedTo.map((portal) => (
            <span key={portal} className="text-foreground">
              {PORTAL_LABEL[portal] ?? portal}
            </span>
          ))}
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-3 text-sm">
        <Stat label="Vistas" value={formatNumber(listing.viewsCount)} />
        <span className="text-muted-foreground/40">|</span>
        <Stat label="Leads" value={listing.leadsCount.toString()} />
        {hasStaging ? (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Sparkles className="size-3" strokeWidth={1.5} />
              Staging IA
            </span>
          </>
        ) : null}
      </div>

      <Button variant="outline" size="sm" className="mt-auto">
        Ver detalle
      </Button>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-1 items-baseline gap-1.5">
      <span className="text-base font-medium tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </span>
  );
}
