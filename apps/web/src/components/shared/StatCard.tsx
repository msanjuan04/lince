import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  emphasized?: boolean;
  className?: string;
}

/**
 * Stat editorial: número grande en peso medio + label sobrio.
 * Sin iconos, sin trend hints. La densidad la cuentan los números.
 */
export function StatCard({ label, value, hint, emphasized, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'border-border flex flex-col gap-1.5 border-t pb-1 pt-5',
        emphasized && 'border-foreground border-t-2',
        className,
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-3xl font-medium tabular-nums tracking-[-0.02em]">{value}</span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  );
}
