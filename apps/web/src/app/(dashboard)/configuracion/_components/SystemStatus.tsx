'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, XCircle, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { testWhatsAppAction, type SystemStatus as SystemStatusType } from '../_actions';

interface SystemStatusProps {
  status: SystemStatusType;
}

export function SystemStatus({ status }: SystemStatusProps) {
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState('+34 623 808 712');
  const [lastResult, setLastResult] = useState<string | null>(null);

  function send() {
    startTransition(async () => {
      const r = await testWhatsAppAction(phone);
      if (r.ok) {
        if (r.dryRun) {
          toast.warning('Sin credenciales WhatsApp → modo DRY (mensaje logueado)');
          setLastResult('OK (dry run — los logs del dev server muestran el mensaje)');
        } else {
          toast.success(`Enviado a ${r.to} · id ${r.messageId?.slice(0, 16)}…`);
          setLastResult(`Mensaje enviado correctamente · ${r.messageId}`);
        }
      } else {
        toast.error(r.error ?? 'Error desconocido');
        setLastResult(`Error: ${r.error ?? 'sin detalle'}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* KPIs del sistema */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        <Kpi label="Propiedades en DB" value={status.totalProperties} emphasized />
        <Kpi label="Zonas activas" value={status.totalZones} />
        <Kpi label="En tu seguimiento" value={status.totalTracked} />
        <Kpi label="Alertas pendientes" value={status.totalAlertsPending} />
        <Kpi label="Alertas enviadas" value={status.totalAlertsSent} />
        <Kpi
          label="Último crawler"
          value={
            status.lastCrawlerRunAt
              ? `${status.lastCrawlerRunSource ?? '—'} · ${formatRelativeDate(status.lastCrawlerRunAt)}`
              : 'sin runs todavía'
          }
        />
      </div>

      {/* Health checks */}
      <div className="border-border flex flex-col gap-3 border-t pt-5">
        <h3 className="text-sm font-medium">Salud del sistema</h3>
        <ul className="flex flex-col gap-2">
          <HealthRow
            ok={status.db === 'ok'}
            label="Base de datos (Supabase Frankfurt)"
            okText="Conectada"
            failText="Sin conexión — revisa DATABASE_URL/DIRECT_URL en .env.local"
          />
          <HealthRow
            ok={status.anthropicConfigured}
            label="Anthropic Claude API"
            okText="Configurado — Pulse Agent operativo"
            failText="Sin ANTHROPIC_API_KEY — Pulse en modo dry"
          />
          <HealthRow
            ok={status.telegramConfigured}
            label="Telegram Bot (dispatch del Pulse)"
            okText="Configurado — bot operativo"
            failText="Sin TELEGRAM_BOT_TOKEN — Pulse no se enviará"
          />
          <HealthRow
            ok={status.whatsappCredentialsPresent}
            label="WhatsApp Cloud API (Meta) — pausado"
            okText={`Configurado · phone_number_id ${status.whatsappPhoneNumberId?.slice(0, 8)}…`}
            failText="Sin WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID — modo dry"
          />
        </ul>
      </div>

      {/* Jobs automatizados */}
      <div className="border-border flex flex-col gap-3 border-t pt-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Jobs automatizados</h3>
          <span className="text-muted-foreground text-xs">
            Última ejecución conocida por cada job. Para arrancar el scheduler:{' '}
            <code className="font-mono">pnpm --filter @lince/scheduler start</code>
          </span>
        </div>
        {status.jobsLastRun.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay ejecuciones registradas todavía. El scheduler creará entradas en{' '}
            <code className="font-mono">crawler_runs</code> según vaya disparando los crons.
          </p>
        ) : (
          <table className="border-border w-full border-collapse border text-sm">
            <thead>
              <tr className="border-border bg-accent/30 border-b text-left">
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide">Job</th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide">
                  Resultado
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide">
                  Última ejecución
                </th>
              </tr>
            </thead>
            <tbody>
              {status.jobsLastRun.map((j) => (
                <tr key={j.source} className="border-border border-b last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">{j.source}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center text-xs font-medium',
                        j.status === 'ok'
                          ? 'text-highlight'
                          : j.status === 'partial'
                            ? 'text-foreground'
                            : 'text-muted-foreground',
                      )}
                    >
                      {j.status ?? '—'}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {j.propertiesFound !== null
                      ? `${j.propertiesFound} encontradas · ${j.propertiesNew ?? 0} nuevas`
                      : '—'}
                    {j.errorsCount > 0 ? (
                      <span className="text-destructive ml-2">· {j.errorsCount} err</span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right text-xs tabular-nums">
                    {j.endedAt
                      ? formatRelativeDate(j.endedAt)
                      : j.startedAt
                        ? `${formatRelativeDate(j.startedAt)} (running)`
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Test WhatsApp */}
      <div className="border-border flex flex-col gap-4 border-t pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Test WhatsApp</h3>
            <p className="text-muted-foreground text-xs">
              Envía un mensaje de prueba al número indicado para verificar las credenciales y ver
              una preview real de un trigger de alerta.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="testPhone" className="text-xs">
              Número destinatario (E.164 o formato español)
            </Label>
            <Input
              id="testPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 623 808 712"
              disabled={pending}
            />
          </div>
          <Button onClick={send} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="size-3.5" />
                Enviar test
              </>
            )}
          </Button>
        </div>
        {lastResult ? (
          <p className="text-muted-foreground bg-muted/30 border-border rounded-sm border px-3 py-2 text-xs">
            {lastResult}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: number | string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        'border-border flex flex-col gap-1.5 border-t pb-1 pt-5',
        emphasized && 'border-foreground border-t-2',
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">{value}</span>
    </div>
  );
}

function HealthRow({
  ok,
  label,
  okText,
  failText,
}: {
  ok: boolean;
  label: string;
  okText: string;
  failText: string;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      {ok ? (
        <CheckCircle2 className="text-highlight size-4 shrink-0" strokeWidth={2} />
      ) : (
        <XCircle className="text-destructive size-4 shrink-0" strokeWidth={2} />
      )}
      <div className="flex flex-1 flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{ok ? okText : failText}</span>
      </div>
    </li>
  );
}
