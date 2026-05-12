'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { analyzeProperty } from '@/lib/financial';
import { formatEuros, formatEurosCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/data/types';

interface FinancialAnalysisSectionProps {
  property: Property;
}

export function FinancialAnalysisSection({ property }: FinancialAnalysisSectionProps) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const analysis = analyzeProperty(property);

  if (analysis.confidence === 'low' || analysis.grossYieldPct === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Datos insuficientes para el análisis financiero. Hace falta precio, m² y CP de zona
        reconocida (BCN / Maresme / Costa Brava).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Yield */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <Metric
          label="Yield bruto"
          value={`${(analysis.grossYieldPct * 100).toFixed(1)}%`}
          hint={
            analysis.estimatedMonthlyRent != null
              ? `${formatEuros(analysis.estimatedMonthlyRent)}/mes alquiler estimado`
              : undefined
          }
          emphasize={analysis.grossYieldPct >= 0.05}
        />
        <Metric
          label="Yield neto (−20% gastos)"
          value={
            analysis.netYieldPct !== null ? `${(analysis.netYieldPct * 100).toFixed(1)}%` : '—'
          }
          emphasize={analysis.netYieldPct !== null && analysis.netYieldPct >= 0.04}
        />
      </div>

      {/* Coste de entrada */}
      {analysis.reformCostEur !== null ? (
        <div className="border-border border-l-foreground/20 bg-muted/20 flex flex-col gap-1 border-l-2 py-2 pl-3">
          <span className="text-muted-foreground text-xs">Coste total de entrada</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-medium tabular-nums tracking-[-0.02em]">
              {analysis.totalEntryCostEur != null ? formatEuros(analysis.totalEntryCostEur) : '—'}
            </span>
            <span className="text-muted-foreground text-xs">
              = precio ({property.price ? formatEurosCompact(property.price) : '—'}) + reforma (
              {formatEurosCompact(analysis.reformCostEur)})
            </span>
          </div>
        </div>
      ) : null}

      {/* Oferta sugerida */}
      {analysis.suggestedOfferEur !== null ? (
        <div className="border-border border-l-highlight bg-highlight/5 flex flex-col gap-1 border-l-2 py-2 pl-3">
          <span className="text-muted-foreground text-xs">Oferta sugerida</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-medium tabular-nums tracking-[-0.02em]">
              {formatEuros(analysis.suggestedOfferEur)}
            </span>
            <span
              className={cn(
                'text-sm tabular-nums',
                analysis.suggestedOfferDiscountPct !== null &&
                  analysis.suggestedOfferDiscountPct > 0
                  ? 'text-highlight'
                  : 'text-muted-foreground',
              )}
            >
              {analysis.suggestedOfferDiscountPct !== null
                ? `${analysis.suggestedOfferDiscountPct > 0 ? '−' : '+'}${Math.abs(
                    Math.round(analysis.suggestedOfferDiscountPct * 100),
                  )}% vs precio actual`
                : ''}
            </span>
          </div>
        </div>
      ) : null}

      {/* ROI a 5 años */}
      {analysis.projectedRoiPct !== null && analysis.projectedValueAt5yEur !== null ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Metric
            label="Valor proyectado a 5 años"
            value={formatEuros(analysis.projectedValueAt5yEur)}
            hint="revalorización 3% anual"
          />
          <Metric
            label="ROI total estimado"
            value={`${Math.round(analysis.projectedRoiPct * 100)}%`}
            hint="incluye 5 años de rentas + venta"
            emphasize={analysis.projectedRoiPct >= 0.4}
          />
        </div>
      ) : null}

      {/* Supuestos */}
      <button
        type="button"
        onClick={() => setShowAssumptions((s) => !s)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-xs"
      >
        <Info className="size-3" />
        {showAssumptions ? 'Ocultar supuestos' : 'Ver supuestos del cálculo'}
      </button>
      {showAssumptions ? (
        <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
          {analysis.assumptions.map((a, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="bg-muted-foreground/30 mt-1.5 size-1 shrink-0" />
              {a}
            </li>
          ))}
          <li className="text-muted-foreground/70 mt-2 italic">
            Estimaciones heurísticas. El agente Pulse (Fase 4) los enriquecerá con criterio
            cualitativo y datos de mercado más finos.
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          'text-xl font-medium tabular-nums tracking-[-0.02em]',
          emphasize && 'text-highlight',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  );
}
