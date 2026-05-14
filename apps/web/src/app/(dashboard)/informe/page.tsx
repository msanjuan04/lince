import type { Metadata } from 'next';
import { marked } from 'marked';
import { Topbar } from '@/components/nav/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { StatusDot } from '@/components/shared/StatusDot';
import { pulseReportsRepo } from '@lince/db';
import { DEMO_AGENCY_ID } from '@/lib/data/mocks/agency';
import { formatRelativeDate } from '@/lib/format';
import { GenerateButton } from './_components/GenerateButton';
import { SendToTelegramButton } from './_components/SendToTelegramButton';

export const metadata: Metadata = { title: 'Informe Pulse' };

interface InventorySnapshot {
  weekStart: string;
  weekEnd: string;
  readerRole: string;
  propertyCount: number;
  zoneCount: number;
  bucketCounts: {
    auction: number;
    bankOwned: number;
    portal: number;
    needsReform: number;
    withRedFlags: number;
  };
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function InformePage() {
  const reports = await pulseReportsRepo
    .listPulseReportsForAgency(DEMO_AGENCY_ID, 20)
    .catch(() => []);
  const latest = reports[0] ?? null;

  const html = latest?.narrative ? (marked.parse(latest.narrative) as string) : '';
  const snap = (latest?.inventorySnapshot as InventorySnapshot | null) ?? null;

  return (
    <>
      <Topbar
        title="Informe Pulse"
        description="Análisis narrado del agente Claude con oferta sugerida y argumentos"
        meta={latest ? `Semana del ${latest.weekOf.toISOString().slice(0, 10)}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            {latest && !latest.dryRun ? <SendToTelegramButton reportId={latest.id} /> : null}
            <GenerateButton />
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-10 p-6 sm:gap-12 sm:p-10">
        {latest ? (
          <>
            <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              <StatCard
                label="Generado"
                value={formatRelativeDate(latest.createdAt)}
                hint={latest.dryRun ? 'dry-run' : (latest.modelId ?? '—')}
                emphasized
              />
              <StatCard
                label="Propiedades analizadas"
                value={snap?.propertyCount ?? '—'}
                hint={`${snap?.zoneCount ?? 0} zonas`}
              />
              <StatCard
                label="Tokens"
                value={
                  latest.tokensIn != null
                    ? `${formatTokens(latest.tokensIn)} + ${formatTokens(latest.tokensOut)}`
                    : '—'
                }
                hint={latest.dryRun ? '(dry-run, sin Claude)' : 'in + out'}
              />
              <StatCard
                label="Coste estimado"
                value={latest.costEur ? `${Number(latest.costEur).toFixed(3)}€` : '—'}
                hint={latest.promptVersion ?? '—'}
              />
            </section>

            {snap ? (
              <section className="border-border flex flex-col gap-2 border-t pt-5">
                <h2 className="text-sm font-medium">Dataset analizado</h2>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Chip label={`${snap.bucketCounts.auction} subastas`} />
                  <Chip label={`${snap.bucketCounts.bankOwned} bank-owned`} />
                  <Chip label={`${snap.bucketCounts.portal} portales`} />
                  <Chip label={`${snap.bucketCounts.needsReform} a reformar`} />
                  <Chip
                    label={`${snap.bucketCounts.withRedFlags} con banderas rojas`}
                    tone={snap.bucketCounts.withRedFlags > 0 ? 'mute' : 'default'}
                  />
                  {latest.dryRun ? <StatusDot label="DRY RUN" tone="mute" /> : null}
                </div>
              </section>
            ) : null}

            <article
              className="prose prose-sm prose-neutral dark:prose-invert [&_h2]:border-foreground [&_strong]:text-foreground max-w-none [&_h1]:font-medium [&_h1]:tracking-[-0.02em] [&_h2]:mt-8 [&_h2]:border-t [&_h2]:pt-4 [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-medium [&_strong]:font-medium"
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {reports.length > 1 ? (
              <section className="border-border flex flex-col gap-3 border-t pt-5">
                <h2 className="text-sm font-medium">Informes anteriores</h2>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {reports.slice(1).map((r) => (
                    <li
                      key={r.id}
                      className="border-border flex items-center justify-between gap-3 border-b py-2"
                    >
                      <span>
                        Semana del{' '}
                        <span className="font-medium">{r.weekOf.toISOString().slice(0, 10)}</span>
                        {r.dryRun ? (
                          <span className="text-muted-foreground/70 ml-2 text-xs">(dry)</span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {r.modelId ?? '—'} · {r.costEur ? `${Number(r.costEur).toFixed(3)}€` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <div className="border-border flex flex-col items-center justify-center gap-3 border py-24 text-center">
            <div className="border-border size-10 border" aria-hidden />
            <div className="flex max-w-md flex-col gap-2">
              <h3 className="text-sm font-medium">Aún no has generado ningún informe</h3>
              <p className="text-muted-foreground text-sm">
                El agente Pulse analiza tu inventario actual, histórico de precios y zonas, y
                devuelve las top 5 oportunidades con oferta sugerida y argumentos de negociación.
                Click en <span className="text-foreground font-medium">Generar informe ahora</span>{' '}
                para ver el primero.
              </p>
              <p className="text-muted-foreground text-xs">
                Coste por informe: ~0,10-0,30€ con Claude Opus 4.7.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Chip({ label, tone = 'default' }: { label: string; tone?: 'default' | 'mute' }) {
  return (
    <span
      className={
        tone === 'mute'
          ? 'border-border text-muted-foreground inline-flex items-center border px-2 py-0.5 text-xs'
          : 'border-border inline-flex items-center border px-2 py-0.5 text-xs'
      }
    >
      {label}
    </span>
  );
}
