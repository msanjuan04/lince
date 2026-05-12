import { Bell, MessageCircle, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusDot } from '@/components/shared/StatusDot';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { formatEurosCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AlertChannel, Zone } from '@/lib/data/types';

const CHANNEL_META: Record<AlertChannel, { label: string; Icon: LucideIcon }> = {
  email: { label: 'Email', Icon: Bell },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
  telegram: { label: 'Telegram', Icon: Send },
};

export function ZoneList({ zones }: { zones: Zone[] }) {
  if (zones.length === 0) {
    return (
      <div className="border-border flex flex-col items-center justify-center gap-3 border py-20 text-center">
        <div className="border-border size-10 border" aria-hidden />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Aún no hay zonas configuradas</h3>
          <p className="text-muted-foreground max-w-sm text-sm">
            Define una zona con sus CPs y filtros para empezar a recibir alertas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-px overflow-hidden border md:grid-cols-2 lg:grid-cols-3">
      {zones.map((zone) => (
        <ZoneCard key={zone.id} zone={zone} />
      ))}
    </div>
  );
}

function ZoneCard({ zone }: { zone: Zone }) {
  const { filters } = zone;
  return (
    <article
      className={cn(
        'bg-card flex flex-col gap-5 p-6 transition-colors',
        !zone.active && 'opacity-60',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-medium tracking-[-0.02em]">{zone.name}</h3>
          <span className="text-muted-foreground text-xs">
            {zone.postalCodes.length}{' '}
            {zone.postalCodes.length === 1 ? 'código postal' : 'códigos postales'}
          </span>
        </div>
        <StatusDot
          label={zone.active ? 'Activa' : 'Pausada'}
          tone={zone.active ? 'highlight' : 'mute'}
        />
      </header>

      <div className="flex flex-wrap gap-1.5">
        {zone.postalCodes.map((cp) => (
          <span
            key={cp}
            className="border-border text-muted-foreground border px-1.5 py-0.5 font-mono text-xs tabular-nums"
          >
            {cp}
          </span>
        ))}
      </div>

      <Separator />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Stat label="Score mín." value={filters.minScore.toString()} />
        <Stat
          label="Precio máx."
          value={filters.maxPrice ? formatEurosCompact(filters.maxPrice) : 'sin tope'}
        />
        <Stat
          label="Habitaciones"
          value={filters.minRooms ? `≥ ${filters.minRooms}` : 'cualquiera'}
        />
        <Stat
          label="Tipos"
          value={
            filters.types.length === 0 ? 'todos' : filters.types.map(propertyTypeLabel).join(', ')
          }
        />
      </dl>

      <Separator />

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Coincidencias actuales</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">
              {zone.matchingCount}
            </span>
            {zone.newToday > 0 ? (
              <span className="text-highlight text-xs font-medium tabular-nums">
                +{zone.newToday} hoy
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {zone.alertChannels.map((ch) => {
              const meta = CHANNEL_META[ch];
              const Icon = meta.Icon;
              return (
                <span key={ch} title={meta.label} aria-label={meta.label}>
                  <Icon className="size-3.5" strokeWidth={1.75} />
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <Button variant="outline" size="sm">
        Editar zona
      </Button>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-right text-xs font-medium">{value}</dd>
    </>
  );
}
