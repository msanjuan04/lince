// Panel honesto del score. Aquí TODO es verificable:
//   - El score es la cifra real del descuento vs mediana del bucket.
//   - El cálculo se muestra literal ("199.000€ / 132m² = 1.508€/m² vs mediana ...")
//   - Las tags son etiquetas binarias con la fuente del dato como tooltip.
//   - Los caveats explican lo que NO sabemos.

'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPricePerM2 } from '@/lib/format';
import type { FactTag, Property } from '@/lib/data/types';

interface Props {
  property: Property;
}

export function OpportunityFactsPanel({ property }: Props) {
  const hasScore = property.opportunityScore !== null;
  const positive = property.tags.filter((t) => t.tone === 'positive');
  const negative = property.tags.filter((t) => t.tone === 'negative');
  const neutral = property.tags.filter((t) => t.tone === 'neutral' || t.tone === 'info');

  return (
    <div className="flex flex-col gap-6">
      {/* Score real con cálculo explícito */}
      <div className="border-border flex flex-col gap-3 border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Score (descuento vs mediana del bucket)
          </span>
          <span className="font-mono text-2xl font-medium tabular-nums tracking-[-0.02em]">
            {hasScore ? `${property.opportunityScore}/100` : '—'}
          </span>
        </div>

        {hasScore && property.discountVsBucketPct !== null ? (
          <CalcLine
            pricePerM2={property.pricePerM2}
            bucketMedian={property.bucketMedianEurM2}
            bucketSample={property.bucketSampleSize}
            discount={property.discountVsBucketPct}
            bucket={bucketLabel(property)}
          />
        ) : null}

        <p className="text-muted-foreground text-xs leading-relaxed">{property.scoreReason}</p>

        <div className="text-muted-foreground/80 border-border mt-1 flex flex-col gap-1 border-t pt-2 text-[11px] leading-relaxed">
          <p>
            <span className="text-foreground font-medium">Cómo se calcula:</span> score = clamp(50 +
            ((mediana − precio) / mediana) × 100, 0, 100). Una cifra, una fórmula, sin pesos
            compuestos.
          </p>
          <p>
            El descuento es matemática real. Lo demás (tags abajo) es contexto, no entra al score.
          </p>
        </div>
      </div>

      {/* Tags factuales agrupadas */}
      {property.tags.length > 0 ? (
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Etiquetas factuales
          </span>
          {positive.length > 0 ? <TagRow label="A favor" tags={positive} /> : null}
          {negative.length > 0 ? <TagRow label="En contra" tags={negative} /> : null}
          {neutral.length > 0 ? <TagRow label="Contexto" tags={neutral} /> : null}
        </div>
      ) : null}

      {/* Caveats — lo que no sabemos */}
      {property.scoreCaveats.length > 0 ? (
        <div className="border-border flex flex-col gap-2 border-l-2 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Info className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Lo que NO sabemos
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {property.scoreCaveats.map((c, i) => (
              <li key={i} className="text-muted-foreground text-xs leading-relaxed">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CalcLine({
  pricePerM2,
  bucketMedian,
  bucketSample,
  discount,
  bucket,
}: {
  pricePerM2: number | null;
  bucketMedian: number | null;
  bucketSample: number;
  discount: number;
  bucket: string;
}) {
  if (pricePerM2 === null || bucketMedian === null) return null;
  const pct = Math.round(Math.abs(discount * 100));
  const sign = discount >= 0 ? 'por debajo' : 'por encima';
  return (
    <div className="flex flex-col gap-1 font-mono text-xs tabular-nums">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-muted-foreground">tu</span>
        <span>{formatPricePerM2(pricePerM2)}</span>
        <span className="text-muted-foreground">vs mediana</span>
        <span>{formatPricePerM2(bucketMedian)}</span>
        <span className="text-muted-foreground">
          ({bucket}, n={bucketSample})
        </span>
      </div>
      <div className="flex items-baseline gap-x-2">
        <span className="text-muted-foreground">→</span>
        <span
          className={cn(
            'font-medium',
            discount > 0 ? 'text-highlight' : discount < 0 ? 'text-muted-foreground' : '',
          )}
        >
          {pct}% {sign} de la mediana
        </span>
      </div>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: FactTag[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li
            key={tag.id}
            title={tag.source}
            className={cn(
              'inline-flex items-center border px-2 py-0.5 text-xs',
              tag.tone === 'positive'
                ? 'border-highlight/40 text-foreground'
                : tag.tone === 'negative'
                  ? 'border-destructive/30 text-foreground'
                  : 'border-border text-muted-foreground',
            )}
          >
            {tag.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function bucketLabel(p: Property): string {
  if (p.isAuction) return 'subasta';
  if (p.isBankOwned) return 'bank-owned';
  return 'portal';
}
