'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TodoistTaskItem({
  id,
  content,
  meta,
  labels = [],
  urgent = false,
}: {
  id: string;
  content: string;
  meta?: string | null;
  labels?: string[];
  urgent?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function completeTask() {
    if (saving) return;
    setSaving(true);
    const response = await fetch(`/api/planning/todoist/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
    });
    if (response.ok) {
      router.refresh();
      return;
    }
    setSaving(false);
  }

  return (
    <div className={urgent ? 'todoistTask todoistTaskUrgent' : 'todoistTask'}>
      <button
        type="button"
        className="todoistCheck"
        onClick={completeTask}
        disabled={saving}
        aria-label={`Taak afronden: ${content}`}
      >
        {saving ? '…' : ''}
      </button>
      <div className="todoistTaskBody">
        <strong>{content}</strong>
        {meta ? <span>{meta}</span> : null}
        {labels.length ? (
          <div className="todoistLabels">
            {labels.map((label) => <small key={label}>{label}</small>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
