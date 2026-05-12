'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { propertyTypeLabel } from '@/components/shared/PropertyTypeLabel';
import { formatEuros, formatM2, formatRelativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Capture } from '@/lib/data/types';

interface CaptureCardProps {
  capture: Capture;
}

export function CaptureCard({ capture }: CaptureCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: capture.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardContent capture={capture} dragging={isDragging} />
    </div>
  );
}

export function CaptureCardOverlay({ capture }: CaptureCardProps) {
  return (
    <div className="rotate-1">
      <CardContent capture={capture} dragging />
    </div>
  );
}

function CardContent({ capture, dragging }: { capture: Capture; dragging: boolean }) {
  const { property } = capture;
  return (
    <article
      className={cn(
        'border-border bg-card hover:border-foreground/40 flex cursor-grab flex-col gap-3 border p-3 transition-all active:cursor-grabbing',
        dragging && 'border-foreground bg-background shadow-md',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {property.opportunityScore !== null ? (
          <ScoreBadge score={property.opportunityScore} size="sm" />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
        <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
          {property.postalCode ?? '—'}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-1 text-sm font-medium leading-snug">{property.address ?? '—'}</h3>
        <p className="text-muted-foreground text-xs">
          {property.city ?? '—'}
          {property.type ? ` · ${propertyTypeLabel(property.type)}` : ''}
          {property.m2 !== null ? ` · ${formatM2(property.m2)}` : ''}
        </p>
      </div>
      <div className="text-foreground text-sm font-medium tabular-nums">
        {property.price !== null ? formatEuros(property.price) : '—'}
      </div>
      {capture.ownerName ? (
        <div className="border-border border-t pt-2 text-xs">
          <div className="font-medium">{capture.ownerName}</div>
          {capture.ownerPhone ? (
            <div className="text-muted-foreground font-mono text-[11px] tabular-nums">
              {capture.ownerPhone}
            </div>
          ) : null}
        </div>
      ) : null}
      {capture.notes ? (
        <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">{capture.notes}</p>
      ) : null}
      <div className="text-muted-foreground/70 flex items-center justify-between text-[10px]">
        <span>{formatRelativeDate(capture.contactedAt ?? capture.createdAt)}</span>
        {capture.proposalPdfUrl ? <span>· Propuesta</span> : null}
      </div>
    </article>
  );
}
