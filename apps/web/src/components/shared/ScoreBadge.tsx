import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Score se renderiza monocromo. Un dot ámbar discreto antes del número
 * marca las gangas reales (≥85). Nada de tiers de color de fondo.
 */
export function ScoreBadge({ score, size = 'md', className }: ScoreBadgeProps) {
  const isHigh = score >= 85;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium tabular-nums',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        size === 'lg' && 'text-base',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'rounded-full',
          size === 'sm' ? 'size-1' : 'size-1.5',
          isHigh ? 'bg-highlight' : 'bg-foreground/20',
        )}
      />
      {Math.round(score)}
    </span>
  );
}
