'use client';

import { useTransition } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/shared/StatusDot';
import { formatEuros, formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { resendAlertAction, resetAlertAction } from '../_actions';

export interface AlertRowProps {
  id: string;
  zoneName: string;
  trigger: 'new_property' | 'price_drop' | 'high_score';
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  channel: string;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
  property: {
    id: string;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    price: number | null;
  };
}

const TRIGGER_LABEL: Record<AlertRowProps['trigger'], string> = {
  new_property: 'Nueva en zona',
  price_drop: 'Rebaja detectada',
  high_score: 'Score alto',
};

const STATUS_LABEL: Record<AlertRowProps['status'], string> = {
  pending: 'Pendiente',
  sent: 'Enviada',
  failed: 'Fallida',
  skipped: 'Omitida',
};

const STATUS_TONE: Record<AlertRowProps['status'], 'default' | 'highlight' | 'mute'> = {
  pending: 'default',
  sent: 'highlight',
  failed: 'default',
  skipped: 'mute',
};

export function AlertRow(props: AlertRowProps) {
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const r = await resendAlertAction(props.id);
      if (r.ok) toast.success(r.dryRun ? 'OK (modo dry — sin credenciales)' : 'Enviada');
      else toast.error(r.error ?? 'No se pudo enviar');
    });
  }

  function reset() {
    startTransition(async () => {
      const r = await resetAlertAction(props.id);
      if (r.ok) toast.success('Reseteada a pending');
      else toast.error(r.error ?? 'No se pudo resetear');
    });
  }

  return (
    <div className="border-border flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-center gap-4">
        <StatusDot label={STATUS_LABEL[props.status]} tone={STATUS_TONE[props.status]} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">
            <span className="font-medium">{TRIGGER_LABEL[props.trigger]}</span>
            <span className="text-muted-foreground"> · </span>
            <Link href={`/oportunidades?selected=${props.property.id}`} className="hover:underline">
              {props.property.address ?? props.property.id.slice(0, 8)}
            </Link>
          </span>
          <span className="text-muted-foreground text-xs">
            zona <span className="text-foreground">{props.zoneName}</span>
            {props.property.city ? ` · ${props.property.city}` : ''}
            {props.property.postalCode ? ` · CP ${props.property.postalCode}` : ''}
            {props.property.price != null ? ` · ${formatEuros(props.property.price)}` : ''}
          </span>
          {props.error ? (
            <span
              className={cn(
                'mt-1 text-xs',
                props.status === 'failed' ? 'text-destructive' : 'text-muted-foreground/70',
              )}
            >
              {props.error}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-muted-foreground text-right text-xs">
          <div>{formatRelativeDate(props.createdAt)}</div>
          {props.sentAt ? (
            <div>enviada {formatRelativeDate(props.sentAt)}</div>
          ) : (
            <div className="text-muted-foreground/40">{props.channel}</div>
          )}
        </div>
        {props.status === 'sent' ? (
          <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
            <RefreshCw className="size-3.5" />
            Reset
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={resend} disabled={pending}>
            <Send className="size-3.5" />
            Enviar
          </Button>
        )}
      </div>
    </div>
  );
}
