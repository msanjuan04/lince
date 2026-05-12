import type { Metadata } from 'next';
import { UserPlus } from 'lucide-react';
import { Topbar } from '@/components/nav/Topbar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StatusDot } from '@/components/shared/StatusDot';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAgencyMembers, getCurrentSession } from '@/lib/data/repositories';
import { formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AgencyPlan } from '@/lib/data/types';

export const metadata: Metadata = {
  title: 'Configuración',
};

const ROLE_LABEL = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agente',
} as const;

const PLANS: { id: AgencyPlan; name: string; price: string; features: string[] }[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: '99 €/mes',
    features: ['1 zona', 'Portales públicos', 'Alertas por email'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '249 €/mes',
    features: ['3 zonas', 'Subastas BOE + SAREB', 'Multi-portal', 'Alertas WhatsApp'],
  },
  {
    id: 'elite',
    name: 'Élite',
    price: '499 €/mes',
    features: ['Zonas ilimitadas', 'Fuentes premium', 'Foto IA + retargeting'],
  },
  {
    id: 'founder',
    name: 'Founder',
    price: '50% durante 6 meses',
    features: ['Acceso anticipado', 'Feedback semanal', 'Todas las features Élite'],
  },
];

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const second = parts[1];
    if (first && second) {
      return (first.charAt(0) + second.charAt(0)).toUpperCase();
    }
    if (first) return first.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default async function ConfiguracionPage() {
  const [{ agency }, members] = await Promise.all([getCurrentSession(), getAgencyMembers()]);

  return (
    <>
      <Topbar title="Configuración" description="Inmobiliaria, equipo y plan" />
      <div className="flex flex-1 flex-col gap-12 p-6 sm:gap-16 sm:p-10">
        <Section
          title="Inmobiliaria"
          description="Datos visibles para tu equipo y usados en propuestas."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agency-name">Nombre comercial</Label>
              <Input id="agency-name" defaultValue={agency.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agency-created">Cliente desde</Label>
              <Input
                id="agency-created"
                defaultValue={formatRelativeDate(agency.createdAt)}
                readOnly
                className="text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm">Guardar cambios</Button>
          </div>
        </Section>

        <Section
          title="Equipo"
          description={`${members.length} ${members.length === 1 ? 'persona con acceso' : 'personas con acceso'}`}
          aside={
            <Button size="sm" variant="outline">
              <UserPlus className="size-3.5" />
              Invitar miembro
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-muted-foreground h-10 pl-0 text-xs font-normal">
                    Persona
                  </TableHead>
                  <TableHead className="text-muted-foreground h-10 text-xs font-normal">
                    Email
                  </TableHead>
                  <TableHead className="text-muted-foreground h-10 text-xs font-normal">
                    Rol
                  </TableHead>
                  <TableHead className="text-muted-foreground h-10 pr-0 text-right text-xs font-normal">
                    Alta
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.userId} className="hover:bg-accent/40 h-14 transition-colors">
                    <TableCell className="pl-0">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-7 rounded-sm">
                          <AvatarFallback className="bg-muted text-foreground rounded-sm text-xs font-medium">
                            {initials(m.user.name, m.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{m.user.name ?? '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.user.email}</TableCell>
                    <TableCell>
                      <StatusDot
                        label={ROLE_LABEL[m.role]}
                        tone={m.role === 'owner' ? 'highlight' : 'default'}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground pr-0 text-right text-xs">
                      {formatRelativeDate(m.user.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section
          title="Plan y facturación"
          description={`Plan actual: ${PLANS.find((p) => p.id === agency.plan)?.name ?? agency.plan}`}
        >
          <div className="grid gap-px overflow-hidden border sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const active = plan.id === agency.plan;
              return (
                <article
                  key={plan.id}
                  className={cn(
                    'bg-card flex flex-col gap-4 p-6',
                    active && 'bg-foreground/[0.02]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-medium tracking-[-0.02em]">{plan.name}</h3>
                    {active ? <StatusDot label="Activo" tone="highlight" /> : null}
                  </div>
                  <p className="text-2xl font-medium tabular-nums tracking-[-0.02em]">
                    {plan.price}
                  </p>
                  <Separator />
                  <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span aria-hidden className="bg-muted-foreground/30 mt-2 size-1 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!active ? (
                    <Button variant="outline" size="sm" className="mt-auto" disabled>
                      Cambiar
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header className="border-foreground border-t pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium tracking-[-0.02em]">{title}</h2>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          {aside}
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}
