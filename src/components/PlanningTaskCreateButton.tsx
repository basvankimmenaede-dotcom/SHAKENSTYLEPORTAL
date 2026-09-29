'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ProjectOption = {
  number: string;
  name: string;
};

export default function PlanningTaskCreateButton({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedProject = projects.find((project) => project.number === projectNumber);

  useEffect(() => {
    if (!open) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open]);

  async function submit() {
    if (!content.trim() || saving) return;
    setSaving(true);
    setError('');

    const response = await fetch('/api/planning/tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        dueDate: dueDate || null,
        projectNumber: projectNumber || null,
        projectName: selectedProject?.name || null,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || 'Taak kon niet worden aangemaakt.');
      setSaving(false);
      return;
    }

    setContent('');
    setDueDate('');
    setProjectNumber('');
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="planningTaskCreate">
      <button
        type="button"
        className="planningTaskCreateButton"
        onClick={() => setOpen((value) => !value)}
      >
        + Taak toevoegen
      </button>

      {open ? (
        <div
          className="planningTaskCreateBackdrop"
          data-planning-modal-open="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="planningTaskCreateModal"
            role="dialog"
            aria-modal="true"
            aria-label="Nieuwe taak toevoegen"
          >
            <button
              type="button"
              className="planningTaskCreateClose"
              aria-label="Sluiten"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            <h2>Nieuwe taak toevoegen</h2>

            <label>
              <span>Taak</span>
              <input
                autoFocus
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Bijv. glaswerk controleren"
              />
            </label>

            <div className="planningTaskCreateGrid">
              <label>
                <span>Project</span>
                <select value={projectNumber} onChange={(event) => setProjectNumber(event.target.value)}>
                  <option value="">Geen project</option>
                  {projects.map((project) => (
                    <option value={project.number} key={project.number}>
                      #{project.number} · {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Deadline</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            </div>

            <div className="planningTaskCreateActions">
              {error ? <small>{error}</small> : <span />}
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>
                Annuleren
              </button>
              <button type="button" className="button orange" onClick={submit} disabled={saving || !content.trim()}>
                {saving ? 'Toevoegen…' : 'Toevoegen'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
