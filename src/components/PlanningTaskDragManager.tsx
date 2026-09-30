'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlanningTaskDragManager() {
  const router = useRouter();

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-task-drop-date]'));

    function dragOver(event: DragEvent) {
      event.preventDefault();
      const section = event.currentTarget as HTMLElement;
      section.classList.add('dragOver');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }

    function dragLeave(event: DragEvent) {
      const section = event.currentTarget as HTMLElement;
      const related = event.relatedTarget as Node | null;
      if (!related || !section.contains(related)) section.classList.remove('dragOver');
    }

    async function drop(event: DragEvent) {
      event.preventDefault();
      const section = event.currentTarget as HTMLElement;
      section.classList.remove('dragOver');

      const raw = event.dataTransfer?.getData('application/x-shakenstyle-task');
      if (!raw) return;

      let payload: { id?: string; useDeadline?: boolean } = {};
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      if (!payload.id) return;

      const dueDate = section.dataset.taskDropDate || null;
      section.classList.add('moving');

      const response = await fetch(`/api/planning/tasks/${encodeURIComponent(payload.id)}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: dueDate === 'none' ? null : dueDate,
          useDeadline: Boolean(payload.useDeadline),
        }),
      });

      section.classList.remove('moving');

      if (response.ok) {
        window.dispatchEvent(new Event('planning-task-state-changed'));
        router.refresh();
      }
    }

    sections.forEach((section) => {
      section.addEventListener('dragover', dragOver);
      section.addEventListener('dragleave', dragLeave);
      section.addEventListener('drop', drop);
    });

    return () => {
      sections.forEach((section) => {
        section.removeEventListener('dragover', dragOver);
        section.removeEventListener('dragleave', dragLeave);
        section.removeEventListener('drop', drop);
      });
    };
  }, [router]);

  return null;
}
