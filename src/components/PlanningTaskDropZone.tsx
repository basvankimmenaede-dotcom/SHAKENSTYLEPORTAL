'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PlanningTaskDropZone({
  date,
  children,
  className = '',
}: {
  date: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [moving, setMoving] = useState(false);

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setOver(false);

    const raw = event.dataTransfer.getData('application/x-shakenstyle-task');
    if (!raw || moving) return;

    let payload: { id?: string; useDeadline?: boolean } = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (!payload.id) return;

    setMoving(true);
    const response = await fetch(`/api/planning/tasks/${encodeURIComponent(payload.id)}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dueDate: date,
        useDeadline: Boolean(payload.useDeadline),
      }),
    });
    setMoving(false);

    if (response.ok) {
      window.dispatchEvent(new Event('planning-task-state-changed'));
      router.refresh();
    }
  }

  return (
    <section
      className={`${className} planningTaskDropZone${over ? ' dragOver' : ''}${moving ? ' moving' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={handleDrop}
    >
      {children}
    </section>
  );
}
