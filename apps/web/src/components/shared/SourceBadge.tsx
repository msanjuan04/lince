import { cn } from '@/lib/utils';
import type { PropertySource } from '@/lib/data/types';

const SOURCE_LABEL: Record<PropertySource, string> = {
  idealista: 'Idealista',
  fotocasa: 'Fotocasa',
  habitaclia: 'Habitaclia',
  boe: 'BOE',
  sareb: 'SAREB',
  aliseda: 'Aliseda',
  solvia: 'Solvia',
  haya: 'Haya',
  casaktua: 'Casaktua',
  anida: 'Anida',
};

const PREMIUM_SOURCES: PropertySource[] = ['boe', 'sareb', 'aliseda', 'solvia', 'haya'];

interface SourceBadgeProps {
  source: PropertySource;
  className?: string;
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const isPremium = PREMIUM_SOURCES.includes(source);
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs',
        isPremium ? 'text-foreground font-medium' : 'text-muted-foreground',
        className,
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}
