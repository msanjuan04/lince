'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Capture, CaptureStatus } from '@/lib/data/types';
import { CaptureCardOverlay } from './CaptureCard';
import { CaptureColumn } from './CaptureColumn';

const COLUMNS: { status: CaptureStatus; title: string; description: string }[] = [
  { status: 'new', title: 'Nuevas', description: 'Detectadas, sin contactar' },
  { status: 'contacted', title: 'Contactadas', description: 'Conversación abierta' },
  { status: 'meeting', title: 'Visita / reunión', description: 'Cita acordada' },
  { status: 'signed', title: 'Firmadas', description: 'Exclusiva cerrada' },
  { status: 'lost', title: 'Perdidas', description: 'No prosperó' },
];

const COLUMN_LABEL: Record<CaptureStatus, string> = {
  new: 'Nuevas',
  contacted: 'Contactadas',
  meeting: 'Visita / reunión',
  signed: 'Firmadas',
  lost: 'Perdidas',
};

interface CaptureBoardProps {
  initialGrouped: Record<CaptureStatus, Capture[]>;
}

export function CaptureBoard({ initialGrouped }: CaptureBoardProps) {
  const [grouped, setGrouped] = useState(initialGrouped);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const captureById = useMemo(() => {
    const map = new Map<string, Capture>();
    for (const list of Object.values(grouped)) {
      for (const c of list) map.set(c.id, c);
    }
    return map;
  }, [grouped]);

  const activeCapture = activeId ? (captureById.get(activeId) ?? null) : null;

  function findColumn(captureId: string): CaptureStatus | null {
    for (const status of Object.keys(grouped) as CaptureStatus[]) {
      if (grouped[status].some((c) => c.id === captureId)) return status;
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromStatus = findColumn(activeId);
    if (!fromStatus) return;

    const toStatus = (Object.keys(grouped) as CaptureStatus[]).includes(overId as CaptureStatus)
      ? (overId as CaptureStatus)
      : findColumn(overId);
    if (!toStatus || toStatus === fromStatus) return;

    setGrouped((prev) => {
      const moving = prev[fromStatus].find((c) => c.id === activeId);
      if (!moving) return prev;
      return {
        ...prev,
        [fromStatus]: prev[fromStatus].filter((c) => c.id !== activeId),
        [toStatus]: [{ ...moving, status: toStatus }, ...prev[toStatus]],
      };
    });

    toast.success(`Movida a "${COLUMN_LABEL[toStatus]}"`);
    // TODO(marc): sustituir por server action `updateCaptureStatus(activeId, toStatus)` con DB.
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map(({ status, title, description }) => (
          <CaptureColumn
            key={status}
            status={status}
            title={title}
            description={description}
            captures={grouped[status]}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCapture ? <CaptureCardOverlay capture={activeCapture} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
