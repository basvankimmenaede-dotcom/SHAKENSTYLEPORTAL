'use client';

import { useState } from 'react';

export default function TodoistTaskItem({
  id,
  content,
  meta,
  labels = [],
  urgent = false,
  assignees = [],
  assigneeProfileId = '',
}: {
  id: string;
  content: string;
  meta?: string | null;
  labels?: string[];
  urgent?: boolean;
  assignees?: Array<{ id: string; name: string }>;
  assigneeProfileId?: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignedTo, setAssignedTo] = useState(assigneeProfileId ?? '');

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

  async function assignTask(nextAssignee: string) {
    if (assignmentSaving) return;
    const previous = assignedTo;
    setAssignedTo(nextAssignee);
    setAssignmentSaving(true);
    setError('');

    const response = await fetch('/api/planning/tasks/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: id,
        assigneeProfileId: nextAssignee || null,
      }),
    });

    if (!response.ok) {
      setAssignedTo(previous);
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Toewijzing kon niet worden opgeslagen.');
      setAssignmentSaving(false);
      return;
    }

    setAssignmentSaving(false);
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
        {assignees.length ? (
          <div className="todoistAssignee">
            <span>Toegewezen aan</span>
            <select
              value={assignedTo}
              onChange={(event) => assignTask(event.target.value)}
              disabled={assignmentSaving}
            >
              <option value="">Niemand</option>
              {assignees.map((assignee) => (
                <option value={assignee.id} key={assignee.id}>{assignee.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? <small className="planningInlineError">{error}</small> : null}
      </div>
    </div>
  );
}
