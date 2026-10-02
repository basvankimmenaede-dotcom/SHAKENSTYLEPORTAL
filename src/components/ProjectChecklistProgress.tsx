'use client';

import { useEffect, useState } from 'react';

type ProgressEventDetail = { checklistId: number; done: number; total: number };

export default function ProjectChecklistProgress({
  checklistId,
  initialDone,
  total,
}: {
  checklistId: number;
  initialDone: number;
  total: number;
}) {
  const [done, setDone] = useState(initialDone);
  const [currentTotal, setCurrentTotal] = useState(total);

  useEffect(() => {
    setDone(initialDone);
    setCurrentTotal(total);
  }, [initialDone, total]);

  useEffect(() => {
    function handleProgress(event: Event) {
      const detail = (event as CustomEvent<ProgressEventDetail>).detail;
      if (!detail || detail.checklistId !== checklistId) return;
      setDone(detail.done);
      setCurrentTotal(detail.total);
    }
    window.addEventListener('project-checklist-progress', handleProgress);
    return () => window.removeEventListener('project-checklist-progress', handleProgress);
  }, [checklistId]);

  return (
    <span className={done === currentTotal ? 'compactProgress complete' : 'compactProgress'}>
      {done}/{currentTotal}
    </span>
  );
}
