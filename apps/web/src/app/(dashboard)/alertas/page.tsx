import type { Metadata } from 'next';
import { Topbar } from '@/components/nav/Topbar';
import { StatCard } from '@/components/shared/StatCard';
import { zoneAlertsRepo } from '@lince/db';
import { getCurrentAgencyId } from '@/lib/data/repositories';
import { AlertRow, type AlertRowProps } from './_components/AlertRow';

export const metadata: Metadata = {
  title: 'Alertas',
};

export default async function AlertasPage() {
  const agencyId = await getCurrentAgencyId();
  const [alerts, counts] = await Promise.all([
    zoneAlertsRepo.listAlertsForAgency(agencyId, 200).catch(() => []),
    zoneAlertsRepo.getAlertStatusCounts(agencyId).catch(() => ({}) as Record<string, number>),
  ]);

  const total = alerts.length;
  const pending = counts['pending'] ?? 0;
  const sent = counts['sent'] ?? 0;
  const failed = counts['failed'] ?? 0;
  const skipped = counts['skipped'] ?? 0;

  return (
    <>
      <Topbar
        title="Alertas"
        description="Historial de notificaciones por zona — WhatsApp, email"
        meta={`${total} alertas registradas`}
      />

      <div className="flex flex-1 flex-col gap-10 p-6 sm:gap-12 sm:p-10">
        <section className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <StatCard label="Enviadas" value={sent} emphasized={sent > 0} />
          <StatCard label="Pendientes" value={pending} hint="esperando envío" />
          <StatCard label="Omitidas" value={skipped} hint="sin canal o tlf" />
          <StatCard label="Fallidas" value={failed} hint="error al enviar" />
        </section>

        <section className="flex flex-col gap-4">
          <header>
            <h2 className="text-base font-medium tracking-[-0.02em]">Últimas 200</h2>
            <p className="text-muted-foreground text-sm">
              Click en la dirección para abrir la ficha. Botón para reintentar las pendientes,
              fallidas o omitidas.
            </p>
          </header>

          {alerts.length === 0 ? (
            <div className="border-border flex flex-col items-center justify-center gap-3 border py-20 text-center">
              <div className="border-border size-10 border" aria-hidden />
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">Sin alertas aún</h3>
                <p className="text-muted-foreground max-w-sm text-sm">
                  Las alertas se generan automáticamente cuando el scheduler detecta matches en tus
                  zonas activas.
                </p>
              </div>
            </div>
          ) : (
            <div className="border-border border-t">
              {alerts.map((a) => (
                <AlertRow
                  key={a.id}
                  {...({
                    id: a.id,
                    zoneName: a.zone.name ?? 'sin nombre',
                    trigger: a.trigger,
                    status: a.status,
                    channel: a.channel,
                    error: a.error,
                    createdAt: a.createdAt,
                    sentAt: a.sentAt,
                    property: {
                      id: a.property.id,
                      address: a.property.address,
                      city: a.property.city,
                      postalCode: a.property.postalCode,
                      price: a.property.price ? Number(a.property.price) : null,
                    },
                  } satisfies AlertRowProps)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
