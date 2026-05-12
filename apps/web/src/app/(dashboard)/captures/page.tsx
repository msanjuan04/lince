import type { Metadata } from 'next';
import { Topbar } from '@/components/nav/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { Button } from '@/components/ui/button';
import { getCaptureStats, getCapturesByStatus } from '@/lib/data/repositories';
import { formatEurosCompact } from '@/lib/format';
import { CaptureBoard } from './_components/CaptureBoard';

export const metadata: Metadata = {
  title: 'Captures',
};

export default async function CapturesPage() {
  const [grouped, stats] = await Promise.all([getCapturesByStatus(), getCaptureStats()]);

  return (
    <>
      <Topbar
        title="Captures"
        description="Pipeline activo"
        meta={`${stats.active} en proceso · ${stats.signed} firmadas`}
        actions={
          <Button size="sm" variant="outline">
            Nueva captura
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-10 p-6 sm:gap-12 sm:p-10">
        <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Activas" value={stats.active} hint="en proceso" />
          <StatCard label="Firmadas" value={stats.signed} emphasized={stats.signed > 0} />
          <StatCard
            label="Volumen firmado"
            value={formatEurosCompact(stats.signedValue)}
            hint="sumatorio captado"
          />
        </section>

        <section className="flex flex-col gap-5">
          <header className="flex items-baseline justify-between">
            <h2 className="text-base font-medium tracking-[-0.02em]">Pipeline</h2>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              arrastra para mover entre fases
            </span>
          </header>
          <CaptureBoard initialGrouped={grouped} />
        </section>
      </div>
    </>
  );
}
