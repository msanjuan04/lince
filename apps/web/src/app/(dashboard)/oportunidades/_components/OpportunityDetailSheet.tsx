'use client';

import { ArrowUpRight, BookmarkPlus } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { StatusDot } from '@/components/shared/StatusDot';
import { formatEuros, formatM2, formatPricePerM2, formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PriceHistoryEntry, Property } from '@/lib/data/types';
import { captureProperty } from '../_actions';
import { PriceHistorySection } from './PriceHistorySection';

interface OpportunityDetailSheetProps {
  property: Property | null;
  history: PriceHistoryEntry[];
  open: boolean;
  onClose: () => void;
}

export function OpportunityDetailSheet({
  property,
  history,
  open,
  onClose,
}: OpportunityDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {property ? <Body property={property} history={history} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  property,
  history,
  onClose,
}: {
  property: Property;
  history: PriceHistoryEntry[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const discountPct =
    (property.zoneAvgPricePerM2 - property.pricePerM2) / property.zoneAvgPricePerM2;
  const isUnderMarket = discountPct > 0;

  function onCapture() {
    startTransition(async () => {
      const result = await captureProperty(property.id);
      if (result.ok) {
        toast.success(`${property.address} añadido a captures`);
        onClose();
      } else {
        toast.error(result.error ?? 'No se pudo crear la captura');
      }
    });
  }

  return (
    <>
      <SheetHeader className="border-b px-8 py-6">
        <div className="flex items-center justify-between gap-2">
          <ScoreBadge score={property.opportunityScore} size="sm" />
          <SourceBadge source={property.source} />
        </div>
        <SheetTitle className="mt-3 text-xl font-medium leading-snug tracking-[-0.02em]">
          {property.address}
        </SheetTitle>
        <SheetDescription className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
          <span>{property.city}</span>
          <span aria-hidden>·</span>
          <span className="font-mono text-xs tabular-nums">{property.postalCode}</span>
          <span aria-hidden>·</span>
          <span>{propertyTypeLabel(property.type)}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto">
        <Section title="Datos">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Metric label="Precio" value={formatEuros(property.price)} large />
            <Metric label="€/m²" value={formatPricePerM2(property.pricePerM2)} />
            <Metric label="Superficie" value={formatM2(property.m2)} />
            <Metric
              label="Habitaciones"
              value={property.rooms === 0 ? '—' : property.rooms.toString()}
            />
            <Metric label="Baños" value={property.bathrooms.toString()} />
            <Metric
              label="Construcción"
              value={property.yearBuilt ? property.yearBuilt.toString() : '—'}
            />
          </dl>
        </Section>

        <Separator />

        <Section title="Análisis de mercado">
          <div className="grid grid-cols-3 gap-x-8 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Esta propiedad</span>
              <span className="font-medium tabular-nums">
                {formatPricePerM2(property.pricePerM2)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Media de zona</span>
              <span className="text-muted-foreground font-medium tabular-nums">
                {formatPricePerM2(property.zoneAvgPricePerM2)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Diferencia</span>
              <span
                className={cn(
                  'text-xl font-medium tabular-nums tracking-[-0.02em]',
                  isUnderMarket ? 'text-highlight' : 'text-muted-foreground',
                )}
              >
                {isUnderMarket ? '−' : '+'}
                {Math.abs(Math.round(discountPct * 100))}%
              </span>
            </div>
          </div>
        </Section>

        <Separator />

        <Section title="Histórico de precio">
          <PriceHistorySection history={history} />
        </Section>

        <Separator />

        <Section title="Descripción">
          <p className="text-sm leading-relaxed">{property.description}</p>
        </Section>

        <Separator />

        <Section title="Ubicación">
          <div className="border-border aspect-[16/9] overflow-hidden border">
            <iframe
              key={property.id}
              src={mapEmbedUrl(property.lat, property.lng)}
              className="h-full w-full"
              loading="lazy"
              title={`Mapa de ${property.address}`}
            />
          </div>
          <p className="text-muted-foreground mt-2 font-mono text-xs tabular-nums">
            {property.lat.toFixed(4)}, {property.lng.toFixed(4)}
          </p>
        </Section>

        <Separator />

        <Section title="Trazabilidad">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <Row label="Visto" value={formatRelativeDate(property.firstSeen)} />
            <Row label="Última vista" value={formatRelativeDate(property.lastSeen)} />
            <Row label="ID fuente" value={property.sourceId} mono />
            <Row
              label="Estado"
              valueRender={
                <StatusDot
                  label={
                    property.status === 'active'
                      ? 'Activo'
                      : property.status === 'sold'
                        ? 'Vendido'
                        : 'Retirado'
                  }
                  tone={property.status === 'active' ? 'highlight' : 'mute'}
                />
              }
            />
          </dl>
        </Section>
      </div>

      <div className="bg-background flex flex-row gap-2 border-t px-8 py-4">
        <Button
          render={<a href={property.sourceUrl ?? '#'} target="_blank" rel="noopener noreferrer" />}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          Ver en {property.source}
          <ArrowUpRight className="size-3.5" />
        </Button>
        <Button size="sm" className="flex-1" onClick={onCapture} disabled={pending}>
          <BookmarkPlus className="size-4" />
          {pending ? 'Capturando…' : 'Captar'}
        </Button>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-8 py-6">
      <h3 className="text-muted-foreground mb-5 text-xs">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          'font-medium tabular-nums',
          large ? 'text-2xl tracking-[-0.02em]' : 'text-base',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  valueRender,
  mono,
}: {
  label: string;
  value?: string;
  valueRender?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right', mono && 'font-mono text-xs tabular-nums')}>
        {valueRender ?? value}
      </dd>
    </>
  );
}

function mapEmbedUrl(lat: number, lng: number): string {
  const delta = 0.005;
  const west = lng - delta;
  const south = lat - delta;
  const east = lng + delta;
  const north = lat + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lng}`;
}
