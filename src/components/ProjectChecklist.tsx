'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type PlanningChecklistItem = {
  id: number;
  label: string;
  completed: boolean;
  is_required: boolean;
  sort_order: number;
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
};

export default function ProjectChecklist({
  projectId,
  projectNumber,
  projectName,
  eventDate,
  checklist,
  templates,
}: {
  projectId: number;
  projectNumber: string;
  projectName: string;
  eventDate: string | null;
  checklist?: PlanningChecklist;
  templates: ChecklistTemplate[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(String(templates[0]?.id ?? ''));
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState('');
  const [items, setItems] = useState<PlanningChecklistItem[]>(
    [...(checklist?.project_checklist_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  );

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

  async function toggleItem(item: PlanningChecklistItem) {
    if (pendingIds.has(item.id)) return;

    const nextCompleted = !item.completed;
    setError('');

    setItems((current) =>
      current.map((row) => row.id === item.id ? { ...row, completed: nextCompleted } : row),
    );
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
        setItems((current) =>
          current.map((row) => row.id === item.id ? { ...row, completed: item.completed } : row),
        );
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
              {pending ? <small>opslaan…</small> : item.is_required ? <small>verplicht</small> : null}
            </button>
          );
        })}
      </div>
      {error ? <div className="planningInlineError">{error}</div> : null}
    </div>
  );
}
