'use client';

import { ArrowUpRight, BookmarkPlus, ExternalLink } from 'lucide-react';
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
import type { PropertyTrack } from '@/lib/data/tracking-types';
import { captureProperty } from '../_actions';
import { FinancialAnalysisSection } from './FinancialAnalysisSection';
import { FlipAnalysisSection } from './FlipAnalysisSection';
import { OpportunityFactsPanel } from './OpportunityFactsPanel';
import { PriceHistorySection } from './PriceHistorySection';
import { TrackingSection } from './TrackingSection';
import { VisualAnalysisSection } from './VisualAnalysisSection';

interface OpportunityDetailSheetProps {
  property: Property | null;
  history: PriceHistoryEntry[];
  track: PropertyTrack | null;
  open: boolean;
  onClose: () => void;
}

export function OpportunityDetailSheet({
  property,
  history,
  track,
  open,
  onClose,
}: OpportunityDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {property ? (
          <Body property={property} history={history} track={track} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  property,
  history,
  track,
  onClose,
}: {
  property: Property;
  history: PriceHistoryEntry[];
  track: PropertyTrack | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const discountPct = property.zoneDeltaPct;

  function onCapture() {
    startTransition(async () => {
      const result = await captureProperty(property.id);
      if (result.ok) {
        toast.success(`${property.address ?? property.sourceId} añadido a captures`);
        onClose();
      } else {
        toast.error(result.error ?? 'No se pudo crear la captura');
      }
    });
  }

  const hasSourceUrl = property.sourceUrl !== null && property.sourceUrl !== '';

  return (
    <>
      <SheetHeader className="border-b px-8 py-6">
        <div className="flex items-center justify-between gap-2">
          {property.opportunityScore !== null ? (
            <ScoreBadge score={property.opportunityScore} size="sm" />
          ) : (
            <span className="text-muted-foreground text-xs">Sin score (muestra zona &lt; 3)</span>
          )}
          <SourceBadge source={property.source} />
        </div>
        <SheetTitle className="mt-3 text-xl font-medium leading-snug tracking-[-0.02em]">
          {property.address ?? 'Dirección no expuesta por la fuente'}
        </SheetTitle>
        <SheetDescription className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
          {property.city ? <span>{property.city}</span> : null}
          {property.postalCode ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono text-xs tabular-nums">{property.postalCode}</span>
            </>
          ) : null}
          {property.type ? (
            <>
              <span aria-hidden>·</span>
              <span>{propertyTypeLabel(property.type)}</span>
            </>
          ) : null}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto">
        <Section title="Datos">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Metric
              label="Precio"
              value={property.price !== null ? formatEuros(property.price) : '—'}
              large
            />
            <Metric
              label="€/m²"
              value={property.pricePerM2 !== null ? formatPricePerM2(property.pricePerM2) : '—'}
            />
            <Metric label="Superficie" value={property.m2 !== null ? formatM2(property.m2) : '—'} />
            <Metric
              label="Habitaciones"
              value={
                property.rooms !== null && property.rooms > 0 ? property.rooms.toString() : '—'
              }
            />
            <Metric
              label="Baños"
              value={
                property.bathrooms !== null && property.bathrooms > 0
                  ? property.bathrooms.toString()
                  : '—'
              }
            />
            <Metric
              label="Construcción"
              value={property.yearBuilt !== null ? property.yearBuilt.toString() : '—'}
            />
          </dl>
        </Section>

        <Separator />

        <Section title="Análisis de mercado">
          {property.zoneAvgPricePerM2 !== null && property.pricePerM2 !== null ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-x-8 gap-y-2">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Esta propiedad</span>
                  <span className="font-medium tabular-nums">
                    {formatPricePerM2(property.pricePerM2)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">
                    Mediana CP ({property.zoneSampleSize})
                  </span>
                  <span className="text-muted-foreground font-medium tabular-nums">
                    {formatPricePerM2(property.zoneAvgPricePerM2)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Δ vs CP</span>
                  <span
                    className={cn(
                      'text-xl font-medium tabular-nums tracking-[-0.02em]',
                      discountPct !== null && discountPct > 0
                        ? 'text-highlight'
                        : 'text-muted-foreground',
                    )}
                  >
                    {discountPct !== null
                      ? `${discountPct >= 0 ? '−' : '+'}${Math.abs(Math.round(discountPct * 100))}%`
                      : '—'}
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Mediana real (PERCENTILE_CONT) sobre {property.zoneSampleSize} propiedades en CP{' '}
                {property.postalCode}, excluyendo subastas.
              </p>
              {property.bucketMedianEurM2 !== null &&
              property.bucketMedianEurM2 !== property.zoneAvgPricePerM2 ? (
                <div className="border-border mt-2 flex items-baseline justify-between border-t pt-3">
                  <span className="text-muted-foreground text-xs">
                    Mediana bucket ({bucketLabel(property)}, n={property.bucketSampleSize})
                  </span>
                  <span className="font-mono text-sm tabular-nums">
                    {formatPricePerM2(property.bucketMedianEurM2)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Sin suficientes propiedades en este CP ({property.zoneSampleSize}) para una mediana
              fiable. El análisis comparativo se activa con al menos 3 propiedades en la zona.
            </p>
          )}
        </Section>

        {property.observedHistory.dropCount > 0 ? (
          <>
            <Separator />
            <Section title="Histórico observado por Lince">
              <div className="grid grid-cols-3 gap-x-8 gap-y-3 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Días observado</span>
                  <span
                    className="font-medium tabular-nums"
                    title="Días desde que Lince vio la propiedad por primera vez (no días en mercado real)"
                  >
                    {property.observedHistory.daysObservedByLince}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Rebajas detectadas</span>
                  <span className="font-medium tabular-nums">
                    {property.observedHistory.dropCount} (−
                    {Math.round(Math.abs(property.observedHistory.dropTotalPct))}%)
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Última rebaja</span>
                  <span className="font-medium tabular-nums">
                    {property.observedHistory.daysSinceLastDrop !== null
                      ? `hace ${property.observedHistory.daysSinceLastDrop}d`
                      : '—'}
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                Estos contadores reflejan SOLO lo que Lince ha visto desde la primera vez que
                crawleó la propiedad. NO es el histórico real del portal — podría haber bajado
                precio antes de que la viéramos.
              </p>
            </Section>
          </>
        ) : null}

        <Separator />

        <Section title="Score, etiquetas y caveats">
          <OpportunityFactsPanel property={property} />
        </Section>

        <Separator />

        <Section title="Análisis flip (comprar → reformar → vender)">
          <FlipAnalysisSection property={property} />
        </Section>

        <Separator />

        <Section title="Análisis visual (Claude Vision)">
          <VisualAnalysisSection property={property} />
        </Section>

        <Separator />

        <Section title="Análisis financiero patrimonial">
          <FinancialAnalysisSection property={property} />
        </Section>

        <Separator />

        <Section title="Mi seguimiento">
          <TrackingSection propertyId={property.id} track={track} currentPrice={property.price} />
        </Section>

        <Separator />

        <Section title="Histórico de precio">
          <PriceHistorySection history={history} />
        </Section>

        <Separator />

        <Section title="Banderas y características">
          <FeatureList property={property} />
        </Section>

        <Separator />

        <Section title="Descripción">
          {property.description ? (
            <p className="text-sm leading-relaxed">{property.description}</p>
          ) : (
            <p className="text-muted-foreground text-sm">La fuente no expone descripción.</p>
          )}
        </Section>

        <Separator />

        <Section title="Ubicación">
          {property.lat !== null && property.lng !== null ? (
            <>
              <div className="border-border aspect-[16/9] overflow-hidden border">
                <iframe
                  key={property.id}
                  src={mapEmbedUrl(property.lat, property.lng)}
                  className="h-full w-full"
                  loading="lazy"
                  title={`Mapa de ${property.address ?? property.sourceId}`}
                />
              </div>
              <p className="text-muted-foreground mt-2 font-mono text-xs tabular-nums">
                {property.lat.toFixed(4)}, {property.lng.toFixed(4)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              La fuente no expuso coordenadas exactas. Solo conocemos CP{' '}
              <span className="font-mono">{property.postalCode ?? '—'}</span>. El geocoder de
              Catastro (Fase 1.C) rellenará lat/lng a partir de la dirección o referencia catastral
              cuando esté.
            </p>
          )}
        </Section>

        <Separator />

        <Section title="Trazabilidad de la fuente">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <Row label="Fuente" value={property.sourceLabel} />
            <Row label="ID en fuente" value={property.sourceId} mono />
            {hasSourceUrl ? (
              <Row
                label="Anuncio original"
                valueRender={
                  <a
                    href={property.sourceUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground inline-flex items-center gap-1 hover:underline"
                  >
                    Abrir en {property.sourceLabel}
                    <ExternalLink className="size-3" strokeWidth={1.75} />
                  </a>
                }
              />
            ) : (
              <Row label="Anuncio original" value="No disponible" />
            )}
            {property.cadastralRef ? (
              <Row label="Ref catastral" value={property.cadastralRef} mono />
            ) : null}
            <Row label="Primera vista por Lince" value={formatRelativeDate(property.firstSeen)} />
            <Row label="Última actualización" value={formatRelativeDate(property.lastSeen)} />
            <Row
              label="Estado"
              valueRender={
                property.status === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <StatusDot
                    label={
                      property.status === 'active'
                        ? 'Activo'
                        : property.status === 'auction'
                          ? 'En subasta'
                          : property.status === 'sold'
                            ? 'Vendido'
                            : 'Retirado'
                    }
                    tone={
                      property.status === 'active' || property.status === 'auction'
                        ? 'highlight'
                        : 'mute'
                    }
                  />
                )
              }
            />
          </dl>
        </Section>
      </div>

      <div className="bg-background flex flex-row gap-2 border-t px-8 py-4">
        {hasSourceUrl ? (
          <Button
            render={<a href={property.sourceUrl!} target="_blank" rel="noopener noreferrer" />}
            nativeButton={false}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Ver en {property.sourceLabel}
            <ArrowUpRight className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="flex-1" disabled>
            Sin enlace a fuente
          </Button>
        )}
        <Button size="sm" className="flex-1" onClick={onCapture} disabled={pending}>
          <BookmarkPlus className="size-4" />
          {pending ? 'Capturando…' : 'Captar'}
        </Button>
      </div>
    </>
  );
}

function bucketLabel(p: Property): string {
  if (p.isAuction) return 'subasta';
  if (p.isBankOwned) return 'bank-owned';
  return 'portal';
}

function FeatureList({ property }: { property: Property }) {
  const features: Array<{ label: string; value: string }> = [];
  if (property.condition && property.condition !== 'unknown') {
    features.push({
      label: 'Estado',
      value: CONDITION_LABEL[property.condition] ?? property.condition,
    });
  }
  if (property.hasTerrace === true) features.push({ label: 'Terraza', value: 'Sí' });
  if (property.hasElevator === true) features.push({ label: 'Ascensor', value: 'Sí' });
  if (property.floor) features.push({ label: 'Planta', value: property.floor });
  if (property.orientation) features.push({ label: 'Orientación', value: property.orientation });
  if (property.isBankOwned) features.push({ label: 'Origen', value: 'Bank-owned' });
  if (property.isAuction) features.push({ label: 'Origen', value: 'Subasta judicial' });

  return (
    <div className="flex flex-col gap-4">
      {features.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin características destacadas detectadas.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {features.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">{f.label}</dt>
              <dd className="font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {property.redFlags.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">Banderas rojas</span>
          <ul className="flex flex-wrap gap-1.5">
            {property.redFlags.map((f) => (
              <li
                key={f}
                className="border-foreground/30 bg-foreground/[0.03] inline-flex items-center border px-1.5 py-0.5 text-xs"
              >
                {RED_FLAG_LABEL[f] ?? f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const CONDITION_LABEL: Record<string, string> = {
  needs_reform: 'Para reformar',
  partial_reform: 'Reforma parcial',
  good: 'Buen estado',
  recently_reformed: 'Recién reformado',
  new: 'Obra nueva',
};

const RED_FLAG_LABEL: Record<string, string> = {
  occupied: 'Ocupado',
  has_tenant: 'Con inquilino',
  vpo: 'VPO',
  has_charges: 'Con cargas',
  no_habitability: 'Sin cédula habitabilidad',
  illegal_construction: 'Sin licencia',
  not_visitable: 'No visitable',
  hidden_price: 'Precio oculto',
};

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
