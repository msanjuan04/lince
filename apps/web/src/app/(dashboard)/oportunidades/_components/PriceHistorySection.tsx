'use client';

import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { PriceHistoryEntry } from '@/lib/data/types';
import { formatEuros, formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PriceHistorySectionProps {
  history: PriceHistoryEntry[];
}

/**
 * Histórico de precios de una propiedad:
 *   - Línea con baseline + cada cambio.
 *   - Cuenta total de rebajas y delta acumulado.
 *   - Sparkline mini visual.
 *
 * Si solo hay baseline → mensaje "Sin cambios desde …".
 */
export function PriceHistorySection({ history }: PriceHistorySectionProps) {
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aún no se ha observado esta propiedad. El histórico se construye desde el primer crawl.
      </p>
    );
  }

  const changes = history.filter((h) => h.oldPrice !== null);
  const baseline = history[0]!;
  const latest = history[history.length - 1]!;

  // Sólo baseline (sin cambios todavía)
  if (changes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="border-border bg-muted/20 border-l-foreground/20 flex items-center justify-between border-l-2 px-3 py-2.5">
          <span className="text-sm">
            Sin cambios desde {formatRelativeDate(baseline.observedAt)}
          </span>
          <span className="font-medium tabular-nums">{formatEuros(baseline.newPrice)}</span>
        </div>
      </div>
    );
  }

  // Delta acumulado vs baseline
  const acumDelta = (latest.newPrice - baseline.newPrice) / baseline.newPrice;
  const drops = changes.filter((c) => (c.deltaPct ?? 0) < 0);

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs del histórico */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-2">
        <Stat label="Cambios" value={changes.length.toString()} />
        <Stat label="Rebajas" value={drops.length.toString()} emphasize={drops.length >= 2} />
        <Stat
          label="Variación total"
          value={`${acumDelta >= 0 ? '+' : '−'}${Math.abs(acumDelta * 100).toFixed(1)}%`}
          emphasize={acumDelta <= -0.05}
        />
      </div>

      {/* Sparkline */}
      <Sparkline history={history} />

      {/* Lista cronológica de cambios */}
      <div className="flex flex-col">
        {history
          .slice()
          .reverse()
          .map((entry, i) => {
            const isFirst = i === history.length - 1;
            const delta = entry.deltaPct;
            const isDrop = delta !== null && delta < 0;
            const isRise = delta !== null && delta > 0;
            const Icon = isDrop ? TrendingDown : isRise ? TrendingUp : Minus;
            const tone = isDrop
              ? 'text-highlight'
              : isRise
                ? 'text-foreground'
                : 'text-muted-foreground';
            return (
              <div
                key={i}
                className="border-border flex items-center justify-between border-b py-2.5 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className={cn('size-3.5 shrink-0', tone)} strokeWidth={2} />
                  <div className="flex min-w-0 flex-col gap-0">
                    <span className="text-sm font-medium tabular-nums">
                      {formatEuros(entry.newPrice)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {isFirst
                        ? 'Primera observación'
                        : delta !== null
                          ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs anterior`
                          : '—'}
                    </span>
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0 text-right text-xs">
                  {formatRelativeDate(entry.observedAt)}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          'text-xl font-medium tabular-nums tracking-[-0.02em]',
          emphasize && 'text-highlight',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Sparkline minimal: polyline SVG sin ejes, sin labels.
 * Cada punto = observación. Y normalizado al rango min..max + 5% padding.
 */
function Sparkline({ history }: { history: PriceHistoryEntry[] }) {
  if (history.length < 2) return null;

  const W = 280;
  const H = 48;
  const PAD = 4;

  const prices = history.map((h) => h.newPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);

  const points = history.map((h, i) => {
    const x = PAD + (i / Math.max(1, history.length - 1)) * (W - 2 * PAD);
    // invertimos: precio alto arriba, bajo abajo
    const y = PAD + (1 - (h.newPrice - min) / range) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = points[points.length - 1]!.split(',').map(Number);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="text-foreground"
      role="img"
      aria-label="Evolución del precio"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />
    </svg>
  );
}
