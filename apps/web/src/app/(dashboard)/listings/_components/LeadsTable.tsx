import { StatusDot } from '@/components/shared/StatusDot';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelativeDate } from '@/lib/format';
import type { ListingLead, ListingLeadStatus } from '@/lib/data/types';

const STATUS_LABEL: Record<ListingLeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Cualificado',
  lost: 'Perdido',
  closed: 'Cerrado',
};

const STATUS_TONE: Record<ListingLeadStatus, 'default' | 'highlight' | 'mute'> = {
  new: 'highlight',
  contacted: 'default',
  qualified: 'highlight',
  lost: 'mute',
  closed: 'default',
};

export function LeadsTable({ leads }: { leads: ListingLead[] }) {
  if (leads.length === 0) {
    return (
      <div className="border-border flex flex-col items-center justify-center gap-3 border py-20 text-center">
        <div className="border-border size-10 border" aria-hidden />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Aún no hay leads</h3>
          <p className="text-muted-foreground max-w-sm text-sm">
            Aparecerán aquí cuando un comprador contacte desde Idealista, Fotocasa o tu web.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border overflow-x-auto border-t">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-10 pl-0 text-xs font-normal">
              Lead
            </TableHead>
            <TableHead className="text-muted-foreground h-10 text-xs font-normal">
              Contacto
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-10 text-xs font-normal md:table-cell">
              Mensaje
            </TableHead>
            <TableHead className="text-muted-foreground h-10 text-xs font-normal">Fuente</TableHead>
            <TableHead className="text-muted-foreground h-10 text-xs font-normal">Estado</TableHead>
            <TableHead className="text-muted-foreground h-10 pr-0 text-right text-xs font-normal">
              Recibido
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id} className="hover:bg-accent/40 h-14 transition-colors">
              <TableCell className="pl-0">
                <span className="font-medium">{lead.name}</span>
              </TableCell>
              <TableCell>
                <div className="text-muted-foreground flex flex-col text-xs">
                  <span>{lead.email}</span>
                  {lead.phone ? <span className="font-mono tabular-nums">{lead.phone}</span> : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground hidden max-w-sm md:table-cell">
                <p className="line-clamp-2 text-xs">{lead.message ?? '—'}</p>
              </TableCell>
              <TableCell className="text-sm">{lead.source}</TableCell>
              <TableCell>
                <StatusDot label={STATUS_LABEL[lead.status]} tone={STATUS_TONE[lead.status]} />
              </TableCell>
              <TableCell className="text-muted-foreground pr-0 text-right text-xs">
                {formatRelativeDate(lead.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
