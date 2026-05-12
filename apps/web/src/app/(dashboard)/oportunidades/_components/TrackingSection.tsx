'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusDot } from '@/components/shared/StatusDot';
import { formatEuros, formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  TRACK_STATUS_LABEL,
  TRACK_STATUS_TONE,
  type PropertyTrack,
  type PropertyTrackStatus,
} from '@/lib/data/tracking';
import { removeTrackAction, updateTrackAction } from '../_actions';

const STATUSES: PropertyTrackStatus[] = [
  'watching',
  'interested',
  'contacted',
  'viewed',
  'offering',
  'rejected',
  'bought',
];

interface TrackingSectionProps {
  propertyId: string;
  track: PropertyTrack | null;
  /** Precio actual (para mostrar el delta vs target). */
  currentPrice: number | null;
}

export function TrackingSection({ propertyId, track, currentPrice }: TrackingSectionProps) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<PropertyTrackStatus>(track?.status ?? 'watching');
  const [notes, setNotes] = useState<string>(track?.notes ?? '');
  const [targetPrice, setTargetPrice] = useState<string>(
    track?.targetPriceEur != null ? String(track.targetPriceEur) : '',
  );

  function save() {
    startTransition(async () => {
      const result = await updateTrackAction({
        propertyId,
        status,
        notes,
        targetPriceEur: targetPrice === '' ? '' : Number(targetPrice),
      });
      if (result.ok) toast.success('Seguimiento guardado');
      else toast.error(result.error ?? 'No se pudo guardar');
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeTrackAction(propertyId);
      if (result.ok) {
        toast.success('Quitado del seguimiento');
        setStatus('watching');
        setNotes('');
        setTargetPrice('');
      } else {
        toast.error(result.error ?? 'No se pudo quitar');
      }
    });
  }

  const targetNum = targetPrice === '' ? null : Number(targetPrice);
  const deltaVsTarget =
    currentPrice != null && targetNum != null && currentPrice > 0
      ? ((currentPrice - targetNum) / currentPrice) * 100
      : null;

  return (
    <div className="flex flex-col gap-4">
      {track ? (
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            Actualizado {formatRelativeDate(track.updatedAt)}
            {track.contactedAt ? ` · contacté ${formatRelativeDate(track.contactedAt)}` : ''}
          </span>
          <StatusDot
            label={TRACK_STATUS_LABEL[track.status]}
            tone={TRACK_STATUS_TONE[track.status]}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Aún no estás siguiendo esta propiedad. Guarda para añadirla a tu lista.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Estado</Label>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'border-border inline-flex items-center gap-1.5 border px-2 py-1 text-xs transition-colors',
                status === s
                  ? 'bg-foreground text-background border-foreground'
                  : 'hover:bg-accent/40',
              )}
              disabled={pending}
            >
              {TRACK_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="targetPrice" className="text-xs">
            Mi oferta máxima (€)
          </Label>
          <Input
            id="targetPrice"
            type="number"
            min={0}
            step={1000}
            placeholder="Ej. 220000"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            disabled={pending}
            className="tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Δ vs precio actual</Label>
          <div className="flex h-9 items-center text-sm font-medium tabular-nums">
            {deltaVsTarget !== null ? (
              <span
                className={cn(
                  deltaVsTarget >= 10
                    ? 'text-highlight'
                    : deltaVsTarget >= 0
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {deltaVsTarget >= 0 ? '−' : '+'}
                {Math.abs(Math.round(deltaVsTarget))}%
                {currentPrice != null && targetNum != null ? (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({formatEuros(currentPrice - targetNum)})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes" className="text-xs">
          Notas privadas
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Lo que sepas: estado real, contacto, conversaciones, lo que sea."
          rows={3}
          disabled={pending}
          className="text-sm"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        {track ? (
          <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
            <Trash2 className="size-3.5" />
            Quitar
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Guardando…' : track ? 'Actualizar' : 'Guardar en seguimiento'}
        </Button>
      </div>
    </div>
  );
}
