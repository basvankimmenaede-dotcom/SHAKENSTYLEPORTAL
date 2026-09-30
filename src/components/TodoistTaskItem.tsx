'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type AssigneeOption = {
  id: string;
  name: string;
  role: 'admin' | 'warehouse';
};

function priorityLabel(priority: number) {
  if (priority === 4) return 'P1';
  if (priority === 3) return 'P2';
  if (priority === 2) return 'P3';
  return 'P4';
}

export default function TodoistTaskItem({
  id,
  content,
  rawContent,
  meta,
  dueDate = '',
  useDeadline = false,
  priority = 1,
  taskArea = 'office',
  canChooseOffice = false,
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
  priority?: number;
  taskArea?: 'office' | 'warehouse';
  canChooseOffice?: boolean;
  labels?: string[];
  urgent?: boolean;
  assignees?: AssigneeOption[];
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
  const [editPriority, setEditPriority] = useState(String(priority));
  const [editArea, setEditArea] = useState<'office' | 'warehouse'>(taskArea);

  useEffect(() => {
    setCurrentContent(content);
    setEditContent(rawContent ?? content);
    setEditDueDate(dueDate ?? '');
    setEditPriority(String(priority));
    setEditArea(taskArea);
  }, [content, rawContent, dueDate, priority, taskArea]);

  const visibleAssignees = useMemo(
    () => editArea === 'office'
      ? assignees.filter((assignee) => assignee.role === 'admin')
      : assignees,
    [assignees, editArea],
  );

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
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Taak kon niet worden afgerond.');
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
        priority: Number(editPriority),
        taskArea: editArea,
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

  function startDrag(event: React.DragEvent<HTMLDivElement>) {
    if (editing) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-shakenstyle-task', JSON.stringify({
      id,
      useDeadline,
    }));
  }

  if (completed) {
    return (
      <div
        className="todoistTask todoistTaskCompleted"
        data-task-mine={assignedTo === currentUserId ? 'true' : 'false'}
        data-task-area={taskArea}
      >
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
      data-task-area={taskArea}
      draggable={!editing}
      onDragStart={startDrag}
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

            <label>
              <span>Prioriteit</span>
              <select className="select" value={editPriority} onChange={(event) => setEditPriority(event.target.value)} disabled={editSaving}>
                <option value="4">P1 · Hoog</option>
                <option value="3">P2</option>
                <option value="2">P3</option>
                <option value="1">P4 · Normaal</option>
              </select>
            </label>

            {canChooseOffice ? (
              <label>
                <span>Type taak</span>
                <select
                  className="select"
                  value={editArea}
                  onChange={(event) => {
                    const next = event.target.value === 'warehouse' ? 'warehouse' : 'office';
                    setEditArea(next);
                    if (next === 'office') {
                      const selected = assignees.find((assignee) => assignee.id === assignedTo);
                      if (selected?.role === 'warehouse') setAssignedTo('');
                    }
                  }}
                  disabled={editSaving}
                >
                  <option value="office">Kantoor</option>
                  <option value="warehouse">Magazijn</option>
                </select>
              </label>
            ) : null}

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
                  setEditPriority(String(priority));
                  setEditArea(taskArea);
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
              <div className="todoistTaskTitleActions">
                <span className={`todoistPriority p${priorityLabel(priority).slice(1)}`}>{priorityLabel(priority)}</span>
                <span className={taskArea === 'warehouse' ? 'todoistArea warehouse' : 'todoistArea office'}>
                  {taskArea === 'warehouse' ? 'Magazijn' : 'Kantoor'}
                </span>
                <button className="todoistEditButton" type="button" onClick={() => setEditing(true)}>
                  Wijzigen
                </button>
              </div>
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
              {visibleAssignees.map((assignee) => (
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
