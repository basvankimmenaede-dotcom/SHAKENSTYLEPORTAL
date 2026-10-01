'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = {
  id: number;
  label: string;
  item_type: 'item' | 'heading';
  section_id: number | null;
  section_name: string;
  section_sort_order: number;
  completed: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
};

export default function ClosingChecklist({
  items,
  canManage,
}: {
  items: Item[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState('');

  const actionableRows = rows.filter((row) => row.item_type !== 'heading');
  const done = actionableRows.filter((row) => row.completed).length;

  async function toggle(item: Item) {
    if (!canManage || pending.has(item.id)) return;
    const nextCompleted = !item.completed;
    setError('');
    setRows((current) => current.map((row) => row.id === item.id ? { ...row, completed: nextCompleted } : row));
    setPending((current) => new Set(current).add(item.id));

    const response = await fetch(`/api/planning/closing-checklist/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: nextCompleted }),
    });

    if (!response.ok) {
      setRows((current) => current.map((row) => row.id === item.id ? item : row));
      const result = await response.json().catch(() => ({}));
      setError(result.error || 'Afsluitlijst kon niet worden bijgewerkt.');
    } else {
      router.refresh();
    }

    setPending((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  return (
    <section className="closingChecklistCard">
      <div className="closingChecklistCardHeader">
        <div>
          <span>Vandaag afronden</span>
          <h2>Afsluitlijst</h2>
        </div>
        <strong>{done}/{actionableRows.length}</strong>
      </div>

      <div className="closingProgressTrack">
        <span style={{ width: actionableRows.length ? `${Math.round((done / actionableRows.length) * 100)}%` : '0%' }} />
      </div>

      <div className="closingChecklistItems">
        {Array.from(new Map(
          actionableRows
            .sort((a, b) => a.section_sort_order - b.section_sort_order || a.id - b.id)
            .map((item) => [item.section_id ?? -1, item.section_name]),
        )).map(([sectionId, sectionName]) => (
          <div className="closingChecklistSection" key={sectionId}>
            <div className="closingChecklistHeading">{sectionName}</div>
            {actionableRows
              .filter((item) => (item.section_id ?? -1) === sectionId)
              .map((item) => {
                const busy = pending.has(item.id);
                return (
                  <button
                    type="button"
                    className={item.completed ? 'closingChecklistRow complete' : 'closingChecklistRow'}
                    key={item.id}
                    onClick={() => toggle(item)}
                    disabled={!canManage || busy}
                  >
                    <span className="closingCheckBox">{item.completed ? '✓' : ''}</span>
                    <span className="closingChecklistLabel">{item.label}</span>
                    <small>
                      {busy
                        ? 'opslaan…'
                        : item.completed
                          ? item.completed_by_name
                            ? `Afgevinkt door ${item.completed_by_name}`
                            : 'Afgerond'
                          : 'Nog open'}
                    </small>
                  </button>
                );
              })}
          </div>
        ))}
        {!actionableRows.length ? <div className="compactEmpty">Vandaag staan er geen afsluitpunten gepland.</div> : null}
      </div>

      {error ? <div className="planningInlineError">{error}</div> : null}
    </section>
  );
}
