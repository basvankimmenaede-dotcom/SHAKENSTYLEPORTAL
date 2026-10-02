'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type PlanningChecklistItem = {
  id: number;
  label: string;
  completed: boolean;
  is_required: boolean;
  sort_order: number;
  deadline_offset_days?: number | null;
  due_date?: string | null;
  todoist_task_id?: string | null;
  task_area?: 'office' | 'warehouse' | 'both';
};

export type PlanningChecklist = {
  id: number;
  status: string;
  template_id: number | null;
  project_checklist_items: PlanningChecklistItem[];
};

export type ChecklistTemplate = {
  id: number;
  name: string;
  rentman_project_type_id?: number | null;
};

export default function ProjectChecklist({
  projectId,
  projectNumber,
  projectName,
  eventDate,
  checklist,
  templates,
  preferredTemplateId,
}: {
  projectId: number;
  projectNumber: string;
  projectName: string;
  eventDate: string | null;
  checklist?: PlanningChecklist;
  templates: ChecklistTemplate[];
  preferredTemplateId?: number | null;
}) {
  const router = useRouter();
  const defaultTemplateId = preferredTemplateId
    && templates.some((template) => template.id === preferredTemplateId)
    ? preferredTemplateId
    : templates[0]?.id;
  const [templateId, setTemplateId] = useState(String(defaultTemplateId ?? ''));
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState('');
  const [items, setItems] = useState<PlanningChecklistItem[]>(
    [...(checklist?.project_checklist_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  );

  useEffect(() => {
    setItems(
      [...(checklist?.project_checklist_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    );
  }, [checklist]);

  useEffect(() => {
    if (checklist) return;
    const nextDefault = preferredTemplateId
      && templates.some((template) => template.id === preferredTemplateId)
      ? preferredTemplateId
      : templates[0]?.id;
    setTemplateId(String(nextDefault ?? ''));
  }, [checklist, preferredTemplateId, templates]);



  async function createChecklist() {
    if (!templateId || creating) return;
    setCreating(true);
    setError('');

    const response = await fetch('/api/planning/checklists/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rentmanProjectId: projectId,
        rentmanProjectNumber: projectNumber,
        rentmanProjectName: projectName,
        eventDate,
        templateId: Number(templateId),
      }),
    });

    if (response.ok) {
      router.refresh();
      return;
    }

    const result = await response.json().catch(() => ({}));
    setError(result.error || 'Checklist kon niet worden aangemaakt.');
    setCreating(false);
  }

  function emitProgress(nextItems: PlanningChecklistItem[]) {
    if (!checklist) return;
    const required = nextItems.filter((row) => row.is_required);
    const scope = required.length ? required : nextItems;
    window.dispatchEvent(new CustomEvent('project-checklist-progress', {
      detail: {
        checklistId: checklist.id,
        done: scope.filter((row) => row.completed).length,
        total: scope.length,
      },
    }));
  }

  async function toggleItem(item: PlanningChecklistItem) {
    if (pendingIds.has(item.id)) return;

    const nextCompleted = !item.completed;
    setError('');

    setItems((current) => {
      const next = current.map((row) => row.id === item.id ? { ...row, completed: nextCompleted } : row);
      emitProgress(next);
      return next;
    });
    setPendingIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });

    try {
      const response = await fetch(`/api/planning/checklists/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: nextCompleted }),
      });

      if (!response.ok) {
        setItems((current) => {
          const next = current.map((row) => row.id === item.id ? { ...row, completed: item.completed } : row);
          emitProgress(next);
          return next;
        });
        const result = await response.json().catch(() => ({}));
        setError(result.error || 'Checklist kon niet worden bijgewerkt.');
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (!checklist) {
    return (
      <div className="projectChecklist projectChecklistCreate">
        <div className="projectChecklistTitle">
          <strong>Projectchecklist</strong>
          <span>Nog niet gekoppeld</span>
        </div>
        <div className="projectChecklistCreateRow">
          <select
            className="select"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="button orange"
            onClick={createChecklist}
            disabled={!templateId || creating}
          >
            {creating ? 'Aanmaken…' : 'Checklist koppelen'}
          </button>
        </div>
        {error ? <div className="planningInlineError">{error}</div> : null}
      </div>
    );
  }

  const done = items.filter((item) => item.completed).length;

  return (
    <div className="projectChecklist">
      <div className="projectChecklistTitle">
        <strong>Projectchecklist</strong>
        <span>{done}/{items.length} klaar</span>
      </div>
      <div className="projectChecklistItems">
        {items.map((item) => {
          const pending = pendingIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'projectChecklistItem',
                item.completed ? 'complete' : '',
                pending ? 'saving' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => toggleItem(item)}
              disabled={pending}
              aria-busy={pending}
            >
              <span className="projectChecklistBox">{item.completed ? '✓' : ''}</span>
              <span>{item.label}</span>
              {item.task_area ? (
                <span className={`projectChecklistArea ${item.task_area}`}>
                  {item.task_area === 'office' ? 'Kantoor' : item.task_area === 'warehouse' ? 'Magazijn' : 'Beide'}
                </span>
              ) : null}
              {pending ? (
                <small>opslaan…</small>
              ) : item.due_date ? (
                <small className="projectChecklistDeadline">
                  {new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit' }).format(new Date(`${item.due_date}T12:00:00`))}
                  {item.todoist_task_id ? ' · To Do' : ''}
                </small>
              ) : item.is_required ? (
                <small>verplicht</small>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? <div className="planningInlineError">{error}</div> : null}
    </div>
  );
}
