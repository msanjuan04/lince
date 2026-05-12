import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '@/components/nav/Topbar';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { StatCard } from '@/components/shared/StatCard';
import {
  getBucketDistribution,
  getOpportunityStats,
  getSourceDistribution,
  getTopOpportunities,
} from '@/lib/data/repositories';
import { formatEuros, formatPricePerM2, formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Dashboard',
};

const SOURCE_LABEL_FALLBACK: Record<string, string> = {
  pisos: 'Pisos.com',
  boe: 'BOE Subastas',
  solvia: 'Solvia',
  aliseda: 'Aliseda',
  anticipa: 'Anticipa',
  sareb: 'SAREB',
  haya: 'Haya',
  casaktua: 'Casaktua',
  anida: 'Anida',
  idealista: 'Idealista',
  fotocasa: 'Fotocasa',
  habitaclia: 'Habitaclia',
};

export default async function DashboardPage() {
  const [stats, top, sourceDist, bucketDist] = await Promise.all([
    getOpportunityStats(),
    getTopOpportunities(5),
    getSourceDistribution(),
    getBucketDistribution(),
  ]);

  const totalForBars = Math.max(1, ...sourceDist.map((s) => s.count));

  return (
    <>
      <Topbar
        title="Dashboard"
        description="Resumen del mercado capturado por Lince esta semana"
        meta={`${stats.total} inmuebles activos`}
      />

      <div className="flex flex-1 flex-col gap-12 p-6 sm:p-10">
        {/* KPI strip */}
        <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <StatCard
            label="Inventario activo"
            value={stats.total}
            hint={stats.newToday > 0 ? `+${stats.newToday} hoy` : 'sin alta hoy'}
            emphasized
          />
          <StatCard
            label="Score medio"
            value={stats.avgScore}
            hint={`${stats.highScore} con score ≥ 80`}
          />
          <StatCard label="Subastas judiciales" value={bucketDist.auctions} hint="BOE — Bucket B" />
          <StatCard
            label="Bank-owned"
            value={bucketDist.bankOwned}
            hint="Solvia / Aliseda — Bucket B"
          />
        </section>

        {/* Top 5 oportunidades */}
        <section className="flex flex-col gap-6">
          <header className="flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-medium tracking-[-0.01em]">Top 5 oportunidades</h2>
              <p className="text-muted-foreground text-sm">
                Ordenadas por score (delta €/m² vs mediana de zona).
              </p>
            </div>
            <Link
              href="/oportunidades"
              className="text-foreground text-sm font-medium hover:underline"
            >
              Ver todas →
            </Link>
          </header>

          <div className="border-border border-t">
            {top.map((p, i) => {
              const discountPct = p.zoneDeltaPct;
              return (
                <Link
                  key={p.id}
                  href={`/oportunidades?selected=${p.id}`}
                  className="border-border hover:bg-accent/30 flex flex-col gap-3 border-b px-1 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {p.opportunityScore !== null ? (
                      <ScoreBadge score={p.opportunityScore} size="md" />
                    ) : (
                      <span className="text-muted-foreground/60 w-12 text-xs">N/A</span>
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-1 text-sm font-medium">{p.address ?? '—'}</span>
                      <span className="text-muted-foreground text-xs">
                        {p.city ?? '—'}
                        {p.postalCode ? ` · CP ${p.postalCode}` : ''}
                        {p.type ? ` · ${propertyTypeLabel(p.type)}` : ''}
                        {p.m2 !== null && p.m2 > 0 ? <span> · {p.m2} m²</span> : null}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-6 sm:justify-end">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-medium tabular-nums">
                        {p.price !== null ? formatEuros(p.price) : '—'}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {p.pricePerM2 !== null ? formatPricePerM2(p.pricePerM2) : '—'}
                      </span>
                    </div>
                    <div className="flex w-20 flex-col items-end gap-0.5">
                      <span
                        className={cn(
                          'text-sm font-medium tabular-nums',
                          discountPct !== null && discountPct >= 0.2
                            ? 'text-highlight'
                            : discountPct !== null && discountPct >= 0
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                        )}
                      >
                        {discountPct === null
                          ? '—'
                          : `${discountPct >= 0 ? '−' : '+'}${Math.abs(Math.round(discountPct * 100))}%`}
                      </span>
                      <span className="text-muted-foreground text-[10px]">vs zona</span>
                    </div>
                    <SourceBadge source={p.source} className="w-20" />
                  </div>
                </Link>
              );
            })}
            {top.length === 0 ? (
              <div className="text-muted-foreground py-10 text-center text-sm">
                Aún no hay propiedades en la base. Corre <code>pnpm crawl --source pisos</code>.
              </div>
            ) : null}
          </div>
        </section>

        {/* Distribución por fuente */}
        <section className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-medium tracking-[-0.01em]">Inventario por fuente</h2>
            <div className="border-border flex flex-col border-t">
              {sourceDist.map((s) => {
                const pct = (s.count / totalForBars) * 100;
                const label = SOURCE_LABEL_FALLBACK[s.source] ?? s.source;
                return (
                  <div
                    key={s.source}
                    className="border-border flex items-center gap-4 border-b py-3"
                  >
                    <span className="w-32 shrink-0 text-sm">{label}</span>
                    <div className="bg-muted relative h-1.5 flex-1">
                      <div
                        className="bg-foreground h-full"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="w-10 text-right text-sm tabular-nums">{s.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-medium tracking-[-0.01em]">Buckets de oportunidad</h2>
            <div className="border-border grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5">
              <StatCard label="Bucket B — Subastas" value={bucketDist.auctions} />
              <StatCard label="Bucket B — Bank-owned" value={bucketDist.bankOwned} />
              <StatCard label="Bucket C — Necesita reforma" value={bucketDist.needsReform} />
              <StatCard label="Bucket E — Con terraza" value={bucketDist.withTerrace} />
              <StatCard label="Score ≥ 60" value={bucketDist.highScore} />
              <StatCard label="Con banderas rojas" value={bucketDist.withRedFlags} />
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Banderas rojas: okupación detectada, VPO, cargas pendientes, sin cédula de
              habitabilidad. No descartan automáticamente, alertan al inversor.
            </p>
          </div>
        </section>

        {/* Footer call to action */}
        <section className="border-border flex flex-col gap-3 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            ¿Buscas algo concreto? Filtra por zona, precio, tipo y características.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/oportunidades"
              className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center px-4 py-2 text-sm font-medium transition-colors"
            >
              Explorar oportunidades
            </Link>
            <Link
              href="/oportunidades/mapa"
              className="border-border hover:bg-accent/50 inline-flex items-center border px-4 py-2 text-sm font-medium transition-colors"
            >
              Ver mapa
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
