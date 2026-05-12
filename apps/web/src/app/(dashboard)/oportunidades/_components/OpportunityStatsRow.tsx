import { StatCard } from '@/components/shared/StatCard';

interface StatsRowProps {
  stats: {
    total: number;
    newToday: number;
    highScore: number;
    avgScore: number;
  };
}

export function OpportunityStatsRow({ stats }: StatsRowProps) {
  return (
    <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
      <StatCard label="Total activas" value={stats.total} />
      <StatCard
        label="Nuevas hoy"
        value={stats.newToday}
        hint={stats.newToday > 0 ? 'detectadas en 24 h' : 'sin novedades'}
      />
      <StatCard
        label="Score ≥ 80"
        value={stats.highScore}
        hint="alta prioridad"
        emphasized={stats.highScore > 0}
      />
      <StatCard label="Score medio" value={stats.avgScore} hint="sobre 100" />
    </section>
  );
}
