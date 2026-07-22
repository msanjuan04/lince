// Análisis flip honesto. Cada cifra con su porqué:
//  - Coste compra: precio anuncio + ITP 10% (Catalunya) + notaría 1,5%
//  - Coste reforma: m² × €/m² reforma (input variable)
//  - Precio salida: del informe Idealista/Indomio/Fotocasa abril 2026
//    con -10% safety margin (no asumimos el techo histórico)
//  - Margen anualizado: calculado solo si hay ciclo estimado
//
// Si falta cualquier dato, se muestra "no calculable" + razón.

'use client';

import { Info, Timer, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatEuros } from '@/lib/format';
import type { AbsorptionView, MarketReference, Property } from '@/lib/data/types';

interface Props {
  property: Property;
}

export function FlipAnalysisSection({ property }: Props) {
  const flip = property.flipEstimate;
  const ref = property.marketReference;

  if (!flip) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay datos suficientes para estimar el flip (falta precio o m² en la fuente).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {ref ? <MarketReferenceCard reference={ref} /> : null}
      {property.absorption ? <AbsorptionCard absorption={property.absorption} /> : null}

      {flip.reasons.length > 0 ? (
        <div className="border-border flex flex-col gap-2 border-l-2 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Info className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Algunos valores no se pudieron calcular
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {flip.reasons.map((r, i) => (
              <li key={i} className="text-muted-foreground text-xs leading-relaxed">
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        <Metric
          label="Coste adquisición"
          value={flip.acquisitionCostTotal !== null ? formatEuros(flip.acquisitionCostTotal) : '—'}
          hint="precio + ITP 10% + notaría 1,5%"
        />
        <Metric
          label="Coste reforma"
          value={flip.reformCost !== null ? formatEuros(flip.reformCost) : '—'}
          hint={`${property.m2 ?? '—'}m² × ${flip.params.eurM2Reform}€/m²`}
        />
        <Metric
          label="Inversión total"
          value={flip.totalInvestment !== null ? formatEuros(flip.totalInvestment) : '—'}
          hint="adquisición + reforma"
          large
        />
        <Metric
          label="Precio salida estimado"
          value={flip.expectedSalePrice !== null ? formatEuros(flip.expectedSalePrice) : '—'}
          hint={
            flip.expectedSaleEurM2 !== null
              ? `${property.m2 ?? '—'}m² × ${flip.expectedSaleEurM2}€/m²`
              : 'sin referencia de zona'
          }
          large
        />
      </div>

      <div className="border-border grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-4 sm:grid-cols-4">
        <Metric
          label="Margen bruto"
          value={flip.grossMarginEur !== null ? formatEuros(flip.grossMarginEur) : '—'}
          highlight={flip.grossMarginEur !== null && flip.grossMarginEur > 0}
        />
        <Metric
          label="Margen %"
          value={flip.grossMarginPct !== null ? `${(flip.grossMarginPct * 100).toFixed(1)}%` : '—'}
          highlight={flip.grossMarginPct !== null && flip.grossMarginPct > 0}
        />
        <Metric
          label="Ciclo estimado"
          value={flip.cycleMonths !== null ? `${flip.cycleMonths} meses` : '—'}
          hint={flip.cycleMonths === null ? 'sin datos absorción' : undefined}
        />
        <Metric
          label="Anualizado"
          value={
            flip.annualizedMarginPct !== null
              ? `${(flip.annualizedMarginPct * 100).toFixed(1)}%/año`
              : '—'
          }
          highlight={flip.annualizedMarginPct !== null && flip.annualizedMarginPct > 0.3}
          large
        />
      </div>

      {flip.breakdown.length > 0 ? (
        <details className="border-border border-l-2 pl-3">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Ver desglose paso a paso
          </summary>
          <ol className="text-muted-foreground mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-relaxed">
            {flip.breakdown.map((line, i) => (
              <li key={i} className="font-mono tabular-nums">
                {line}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {flip.expectedSaleSource ? (
        <p className="text-muted-foreground/80 border-border border-t pt-3 text-[11px] leading-relaxed">
          <span className="text-foreground font-medium">Precio salida basado en:</span>{' '}
          {flip.expectedSaleSource}. Aplicamos un −10% de margen de seguridad sobre la cifra
          publicada (no asumimos el techo histórico). Cuando Lince acumule histórico real de
          absorción del CP, este número se sustituirá por la mediana medida directamente.
        </p>
      ) : null}
    </div>
  );
}

function AbsorptionCard({ absorption }: { absorption: AbsorptionView }) {
  const months = Math.round(absorption.medianDays / 30);
  return (
    <div className="border-border flex flex-col gap-2 border p-3">
      <div className="flex items-center gap-2">
        <Timer className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Absorción medida (CP + bucket {absorption.bucket})
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">
          Mediana <span className="font-medium">{absorption.medianDays} días</span> ({months}{' '}
          {months === 1 ? 'mes' : 'meses'})
        </p>
        <span className="text-muted-foreground text-[11px]">
          n={absorption.sampleSize} propiedades observadas
        </span>
      </div>
      <p className="text-muted-foreground/80 text-[11px] leading-relaxed">
        Mediana real entre `first_seen` y la primera ausencia en el crawler. Proxy de «vendida o
        retirada». Alimenta el ciclo del flip para anualizar el margen.
      </p>
    </div>
  );
}

function MarketReferenceCard({ reference }: { reference: MarketReference }) {
  return (
    <div className="border-border flex flex-col gap-2 border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Referencia de zona ({reference.tier})
          </span>
        </div>
        <span
          className={cn(
            'inline-flex items-center border px-2 py-0.5 text-[11px]',
            reference.momentum === 'high'
              ? 'border-highlight/40 text-foreground'
              : reference.momentum === 'negative'
                ? 'border-destructive/40 text-foreground'
                : 'border-border text-muted-foreground',
          )}
        >
          {momentumLabel(reference.momentum)} ({reference.yoyPct >= 0 ? '+' : ''}
          {reference.yoyPct.toFixed(1)}%)
        </span>
      </div>
      <p className="text-sm font-medium">
        {reference.municipality}
        {reference.district ? ` · ${reference.district}` : ''}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Medio</span>
          <span className="font-mono tabular-nums">
            {reference.avgEurM2.toLocaleString('es-ES')}€/m²
          </span>
        </div>
        {reference.premiumEurM2 !== null ? (
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Premium</span>
            <span className="font-mono tabular-nums">
              {reference.premiumEurM2.toLocaleString('es-ES')}€/m²
            </span>
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground/80 text-[11px]">Fuente: {reference.source}</p>
      {reference.notes ? (
        <p className="text-muted-foreground text-[11px] italic leading-relaxed">
          {reference.notes}
        </p>
      ) : null}
    </div>
  );
}

function momentumLabel(m: string): string {
  switch (m) {
    case 'high':
      return 'Momentum alto';
    case 'medium':
      return 'Momentum medio';
    case 'low':
      return 'Momentum bajo';
    case 'negative':
      return 'Momentum negativo';
    default:
      return m;
  }
}

function Metric({
  label,
  value,
  hint,
  large,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  large?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          'font-medium tabular-nums',
          large ? 'text-xl tracking-[-0.02em]' : 'text-sm',
          highlight ? 'text-highlight' : '',
        )}
      >
        {value}
      </dd>
      {hint ? <span className="text-muted-foreground/70 text-[11px]">{hint}</span> : null}
    </div>
  );
}
