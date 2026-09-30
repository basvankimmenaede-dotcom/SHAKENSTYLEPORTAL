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
  taskArea?: 'office' | 'warehouse' | 'both';
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
  const [editArea, setEditArea] = useState<'office' | 'warehouse' | 'both'>(taskArea);

  useEffect(() => {
    setCurrentContent(content);
    setEditContent(rawContent ?? content);
    setEditDueDate(dueDate ?? '');
    setEditPriority(String(priority));
    setEditArea(taskArea);
  }, [content, rawContent, dueDate, priority, taskArea]);

  useEffect(() => {
    if (!editing) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !editSaving) {
        setEditing(false);
        setError('');
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editing, editSaving]);

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
        <div className="todoistTaskTitleRow">
          <strong>{currentContent}</strong>
          <div className="todoistTaskTitleActions">
            <span className={`todoistPriority p${priorityLabel(priority).slice(1)}`}>{priorityLabel(priority)}</span>
            <span className={`todoistArea ${taskArea}`}>
              {taskArea === 'warehouse' ? 'Magazijn' : taskArea === 'both' ? 'Beide' : 'Kantoor'}
            </span>
            <button className="todoistEditButton" type="button" onClick={() => setEditing(true)}>
              Wijzigen
            </button>
          </div>
        </div>
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
              {visibleAssignees.map((assignee) => (
                <option value={assignee.id} key={assignee.id}>{assignee.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {error && !editing ? <small className="planningInlineError">{error}</small> : null}
      </div>

      {editing ? (
        <div
          className="planningTaskCreateBackdrop"
          data-planning-modal-open="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editSaving) {
              setEditing(false);
              setError('');
            }
          }}
        >
          <section
            className="planningTaskCreateModal"
            role="dialog"
            aria-modal="true"
            aria-label="Taak wijzigen"
          >
            <button
              type="button"
              className="planningTaskCreateClose"
              aria-label="Sluiten"
              onClick={() => {
                if (!editSaving) {
                  setEditing(false);
                  setError('');
                }
              }}
            >
              ×
            </button>

            <h2>Taak wijzigen</h2>

            <label>
              <span>Taak</span>
              <input
                autoFocus
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                disabled={editSaving}
              />
            </label>

            <div className="planningTaskCreateGrid">
              <label>
                <span>Deadline</span>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(event) => setEditDueDate(event.target.value)}
                  disabled={editSaving}
                />
              </label>

              <label>
                <span>Prioriteit</span>
                <select
                  value={editPriority}
                  onChange={(event) => setEditPriority(event.target.value)}
                  disabled={editSaving}
                >
                  <option value="4">P1 · Hoog</option>
                  <option value="3">P2</option>
                  <option value="2">P3</option>
                  <option value="1">P4 · Normaal</option>
                </select>
              </label>
            </div>

            {canChooseOffice ? (
              <div className="planningTaskCreateGrid">
                <label>
                  <span>Type taak</span>
                  <select
                    value={editArea}
                    onChange={(event) => {
                      const next = event.target.value === 'warehouse'
                        ? 'warehouse'
                        : event.target.value === 'both'
                          ? 'both'
                          : 'office';
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
                    <option value="both">Beide</option>
                  </select>
                </label>
                <div />
              </div>
            ) : null}

            <div className="planningTaskCreateActions">
              {error ? <small>{error}</small> : <span />}
              <button
                type="button"
                className="button secondary"
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
              <button
                type="button"
                className="button orange"
                onClick={saveEdit}
                disabled={editSaving || !editContent.trim()}
              >
                {editSaving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
