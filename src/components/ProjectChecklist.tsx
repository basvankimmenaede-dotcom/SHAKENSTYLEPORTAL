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
  const [busyId, setBusyId] = useState<number | 'create' | null>(null);
  const [error, setError] = useState('');

  async function createChecklist() {
    if (!templateId || busyId) return;
    setBusyId('create');
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
    setBusyId(null);
  }

  async function toggleItem(item: PlanningChecklistItem) {
    if (busyId) return;
    setBusyId(item.id);
    setError('');

    const response = await fetch(`/api/planning/checklists/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !item.completed }),
    });

    if (response.ok) {
      router.refresh();
      return;
    }

    const result = await response.json().catch(() => ({}));
    setError(result.error || 'Checklist kon niet worden bijgewerkt.');
    setBusyId(null);
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
            disabled={!templateId || busyId === 'create'}
          >
            {busyId === 'create' ? 'Aanmaken…' : 'Checklist koppelen'}
          </button>
        </div>
        {error ? <div className="planningInlineError">{error}</div> : null}
      </div>
    );
  }

  const items = [...(checklist.project_checklist_items ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const done = items.filter((item) => item.completed).length;

  return (
    <div className="projectChecklist">
      <div className="projectChecklistTitle">
        <strong>Projectchecklist</strong>
        <span>{done}/{items.length} klaar</span>
      </div>
      <div className="projectChecklistItems">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.completed ? 'projectChecklistItem complete' : 'projectChecklistItem'}
            onClick={() => toggleItem(item)}
            disabled={busyId === item.id}
          >
            <span className="projectChecklistBox">{item.completed ? '✓' : ''}</span>
            <span>{item.label}</span>
            {item.is_required ? <small>verplicht</small> : null}
          </button>
        ))}
      </div>
      {error ? <div className="planningInlineError">{error}</div> : null}
    </div>
  );
}
