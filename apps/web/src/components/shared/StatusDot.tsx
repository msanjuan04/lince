import { cn } from '@/lib/utils';

type Tone = 'default' | 'highlight' | 'mute';

interface StatusDotProps {
  label: string;
  tone?: Tone;
  className?: string;
}

/**
 * Estado renderizado como dot + texto. Sin badge de fondo color.
 */
export function StatusDot({ label, tone = 'default', className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          tone === 'default' && 'bg-foreground',
          tone === 'highlight' && 'bg-highlight',
          tone === 'mute' && 'bg-muted-foreground/40',
        )}
      />
      <span className={tone === 'mute' ? 'text-muted-foreground' : ''}>{label}</span>
    </span>
  );
}
