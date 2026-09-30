'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TodoistTaskItem({
  id,
  content,
  rawContent,
  meta,
  dueDate = '',
  useDeadline = false,
  labels = [],
  urgent = false,
  assignees = [],
  assigneeProfileId = '',
  currentUserId,
}: {
  id: string;
  content: string;
  rawContent?: string;
  meta?: string | null;
  dueDate?: string | null;
  useDeadline?: boolean;
  labels?: string[];
  urgent?: boolean;
  assignees?: Array<{ id: string; name: string }>;
  assigneeProfileId?: string | null;
  currentUserId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignedTo, setAssignedTo] = useState(assigneeProfileId ?? '');
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [currentContent, setCurrentContent] = useState(content);
  const [editContent, setEditContent] = useState(rawContent ?? content);
  const [editDueDate, setEditDueDate] = useState(dueDate ?? '');

  useEffect(() => {
    setCurrentContent(content);
    setEditContent(rawContent ?? content);
    setEditDueDate(dueDate ?? '');
  }, [content, rawContent, dueDate]);

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
    window.dispatchEvent(new Event('planning-task-state-changed'));
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
    window.dispatchEvent(new Event('planning-task-state-changed'));
  }

  async function saveEdit() {
    if (editSaving) return;
    const nextContent = editContent.trim();
    if (!nextContent) {
      setError('Vul een taaknaam in.');
      return;
    }

    setEditSaving(true);
    setError('');

    const response = await fetch(`/api/planning/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: nextContent,
        dueDate: editDueDate || null,
        useDeadline,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Taak kon niet worden gewijzigd.');
      setEditSaving(false);
      return;
    }

    setCurrentContent(nextContent);
    setEditing(false);
    setEditSaving(false);
    window.dispatchEvent(new Event('planning-task-state-changed'));
    router.refresh();
  }

  if (completed) {
    return (
      <div className="todoistTask todoistTaskCompleted" data-task-mine={assignedTo === currentUserId ? 'true' : 'false'}>
        <span className="todoistCheck todoistCheckDone">✓</span>
        <div className="todoistTaskBody">
          <strong>{currentContent}</strong>
          <span>Afgerond</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={urgent ? 'todoistTask todoistTaskUrgent' : 'todoistTask'}
      data-task-mine={assignedTo === currentUserId ? 'true' : 'false'}
    >
      <button
        type="button"
        className="todoistCheck"
        onClick={completeTask}
        disabled={saving}
        aria-label={`Taak afronden: ${currentContent}`}
      >
        {saving ? '…' : ''}
      </button>

      <div className="todoistTaskBody">
        {editing ? (
          <div className="todoistEditForm">
            <label>
              <span>Taak</span>
              <input
                className="input"
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                disabled={editSaving}
              />
            </label>
            <label>
              <span>Datum</span>
              <input
                className="input"
                type="date"
                value={editDueDate}
                onChange={(event) => setEditDueDate(event.target.value)}
                disabled={editSaving}
              />
            </label>
            <div className="todoistEditActions">
              <button className="button orange" type="button" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? 'Opslaan…' : 'Opslaan'}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setEditContent(rawContent ?? content);
                  setEditDueDate(dueDate ?? '');
                  setEditing(false);
                  setError('');
                }}
                disabled={editSaving}
              >
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="todoistTaskTitleRow">
              <strong>{currentContent}</strong>
              <button className="todoistEditButton" type="button" onClick={() => setEditing(true)}>
                Wijzigen
              </button>
            </div>
            {meta ? <span>{meta}</span> : null}
          </>
        )}

        {!editing && labels.length ? (
          <div className="todoistLabels">
            {labels.map((label) => <small key={label}>{label}</small>)}
          </div>
        ) : null}

        {!editing && assignees.length ? (
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
