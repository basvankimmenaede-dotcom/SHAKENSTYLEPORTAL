'use client';

import { useState } from 'react';

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
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  async function completeTask() {
    if (saving || completed) return;

    setSaving(true);
    setCompleted(true);
    setError('');

    const response = await fetch(`/api/planning/todoist/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
    });

    if (!response.ok) {
      setCompleted(false);
      setSaving(false);
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Taak kon niet worden afgerond.');
      return;
    }

    setSaving(false);
  }

  if (completed) {
    return (
      <div className="todoistTask todoistTaskCompleted">
        <span className="todoistCheck todoistCheckDone">✓</span>
        <div className="todoistTaskBody">
          <strong>{content}</strong>
          <span>Afgerond</span>
        </div>
      </div>
    );
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
        {error ? <small className="planningInlineError">{error}</small> : null}
      </div>
    </div>
  );
}
