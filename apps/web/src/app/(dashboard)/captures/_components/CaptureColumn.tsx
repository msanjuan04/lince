'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Capture, CaptureStatus } from '@/lib/data/types';
import { cn } from '@/lib/utils';
import { CaptureCard } from './CaptureCard';

interface CaptureColumnProps {
  status: CaptureStatus;
  title: string;
  description: string;
  captures: Capture[];
}

export function CaptureColumn({ status, title, description, captures }: CaptureColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const ids = captures.map((c) => c.id);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-col gap-1 px-1">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium tracking-[-0.02em]">{title}</h2>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {captures.length.toString().padStart(2, '0')}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{description}</p>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'border-border flex min-h-[260px] flex-col gap-2 border-t pt-3 transition-colors',
          isOver && 'border-foreground',
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {captures.map((c) => (
            <CaptureCard key={c.id} capture={c} />
          ))}
        </SortableContext>
        {captures.length === 0 ? (
          <div className="text-muted-foreground/50 flex h-20 items-center justify-center text-xs">
            —
          </div>
        ) : null}
      </div>
    </div>
  );
}
