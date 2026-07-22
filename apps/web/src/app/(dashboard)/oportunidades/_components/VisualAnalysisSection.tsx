// Sección "Análisis visual" del detail sheet.
//
//  - Si ya hay un análisis persistido → se muestra (conditionLabel, score,
//    elementos a reformar, banderas visuales, coste reforma estimado, foto).
//  - Si NO hay análisis → botón para analizar bajo demanda. Coste mostrado
//    antes de clicar (~0,02€) para que el usuario sepa qué paga.
//
// Política honesta:
//  - Los datos vienen de Claude Vision sobre UNA foto. No es inspección de
//    perito real. El sistema lo dice en la UI.
//  - reformCostPerM2 es estimación de Claude, NO presupuesto cerrado.

'use client';

import { Eye, Loader2, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Property, VisualAnalysisView } from '@/lib/data/types';
import { analyzePropertyPhotoAction } from '../_actions';

interface Props {
  property: Property;
}

const CONDITION_LABEL_ES: Record<string, string> = {
  needs_reform: 'Para reformar',
  partial_reform: 'Reforma parcial',
  good: 'Buen estado',
  recently_reformed: 'Recién reformado',
  new: 'Obra nueva',
  unknown: 'No determinado',
};

export function VisualAnalysisSection({ property }: Props) {
  const [analysis, setAnalysis] = useState<VisualAnalysisView | null>(property.visualAnalysis);
  const [pending, startTransition] = useTransition();

  if (!property.flipEstimate?.expectedSalePrice && !property.flipEstimate?.totalInvestment) {
    // Si no hay flip estimate viable, la vista visual sigue siendo útil pero menos.
  }

  if (!property.flipEstimate && !analysis) {
    return (
      <p className="text-muted-foreground text-sm">
        Esta propiedad no tiene foto principal en la fuente, no se puede analizar visualmente.
      </p>
    );
  }

  if (!analysis) {
    return (
      <NoAnalysisState
        property={property}
        pending={pending}
        onAnalyze={() => {
          startTransition(async () => {
            const r = await analyzePropertyPhotoAction(property.id);
            if (r.ok) {
              toast.success(
                `Análisis listo · ${CONDITION_LABEL_ES[r.conditionLabel ?? ''] ?? r.conditionLabel ?? '—'} · ${r.costEur?.toFixed(3)}€`,
              );
              // Recargamos la página para que el detail sheet rehidrate con el análisis nuevo.
              window.location.reload();
            } else {
              toast.error(r.error ?? 'Error analizando foto');
            }
          });
        }}
      />
    );
  }

  return <AnalysisResult analysis={analysis} property={property} />;
}

function NoAnalysisState({
  property,
  pending,
  onAnalyze,
}: {
  property: Property;
  pending: boolean;
  onAnalyze: () => void;
}) {
  const imageUrl = property.flipEstimate ? (property as Property).visualAnalysis?.imageUrl : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Claude Vision puede analizar la foto principal del anuncio y detectar: estado general,
        elementos a reformar, banderas rojas visuales (humedad, vigas, etc) y coste de reforma
        estimado en €/m².
      </p>
      <p className="text-muted-foreground text-xs">
        Coste estimado: <span className="font-mono">~0,02€</span> por análisis. Modelo:{' '}
        <span className="font-mono">claude-sonnet-4-5</span>.
      </p>
      <div>
        <Button onClick={onAnalyze} disabled={pending} variant="outline" size="sm">
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Analizando…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Analizar foto con Claude Vision
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function AnalysisResult({
  analysis,
  property: _property,
}: {
  analysis: VisualAnalysisView;
  property: Property;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Cabecera con foto + score + resumen */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="border-border max-w-[200px] overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={analysis.imageUrl}
            alt="Foto principal del anuncio"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium">
              {CONDITION_LABEL_ES[analysis.conditionLabel ?? ''] ?? analysis.conditionLabel ?? '—'}
            </span>
            {analysis.conditionScore !== null ? (
              <span className="text-muted-foreground font-mono text-xs">
                {analysis.conditionScore}/100
              </span>
            ) : null}
            {analysis.photoQuality ? (
              <span className="border-border text-muted-foreground inline-flex items-center border px-1.5 py-0.5 text-[10px]">
                foto {analysis.photoQuality}
              </span>
            ) : null}
          </div>
          {analysis.summary ? <p className="text-sm leading-relaxed">{analysis.summary}</p> : null}
        </div>
      </div>

      {/* Elementos a reformar + red flags */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TagBlock title="Elementos a reformar" items={analysis.elementsToReform} tone="neutral" />
        <TagBlock title="Banderas rojas visuales" items={analysis.visualRedFlags} tone="negative" />
      </div>

      {/* Coste reforma estimado */}
      {analysis.reformCostPerM2 !== null ? (
        <div className="border-border flex items-baseline justify-between border-t pt-3">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              €/m² reforma estimado
            </span>
            <span className="text-muted-foreground text-[11px]">
              Aplica este valor en el panel «Filtros flip» para recalcular margen
            </span>
          </div>
          <span className="font-mono text-2xl font-medium tabular-nums">
            {analysis.reformCostPerM2}€/m²
          </span>
        </div>
      ) : null}

      {/* Footer auditoría */}
      <div className="border-border text-muted-foreground/80 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-[11px]">
        <Eye className="size-3" />
        <span>{analysis.modelId}</span>
        <span>·</span>
        <span>coste {analysis.costEur.toFixed(4)}€</span>
        <span>·</span>
        <span>analizado {new Date(analysis.createdAt).toLocaleDateString('es-ES')}</span>
      </div>

      <p className="text-muted-foreground/70 text-[11px] leading-relaxed">
        Análisis automático sobre la foto principal. NO sustituye a una inspección presencial de
        perito. Los costes son estimaciones — verifica con tu constructor antes de cerrar operación.
      </p>
    </div>
  );
}

function TagBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'neutral' | 'negative';
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {title}
      </span>
      {items.length === 0 ? (
        <span className="text-muted-foreground/60 text-xs italic">ninguno detectado</span>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className={cn(
                'inline-flex items-center border px-2 py-0.5 text-xs',
                tone === 'negative'
                  ? 'border-destructive/30 text-foreground'
                  : 'border-border text-foreground',
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
