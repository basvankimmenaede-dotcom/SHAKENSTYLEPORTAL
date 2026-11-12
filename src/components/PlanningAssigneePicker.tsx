'use client';

export type PlanningAssigneeOption = {
  id: string;
  name: string;
  role: 'admin' | 'warehouse';
};

export default function PlanningAssigneePicker({
  options,
  selectedIds,
  onChange,
  disabled = false,
  compact = false,
}: {
  options: PlanningAssigneeOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = options.filter((person) => selectedIds.includes(person.id));
  const selectionLabel = selected.length
    ? selected.map((person) => person.name).join(', ')
    : 'Niemand';

  return (
    <div className={compact ? 'planningAssigneePicker compact' : 'planningAssigneePicker'}>
      <details>
        <summary aria-label="Medewerkers toewijzen" aria-disabled={disabled}>
          <span title={selectionLabel}>{selectionLabel}</span>
          <span aria-hidden="true" className="planningAssigneePickerChevron">⌄</span>
        </summary>
        <div className="planningAssigneePickerMenu" role="group" aria-label="Medewerkers">
          {options.length ? options.map((person) => (
            <label key={person.id} className="planningAssigneePickerOption">
              <input
                type="checkbox"
                checked={selectedIds.includes(person.id)}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selectedIds, person.id]
                    : selectedIds.filter((id) => id !== person.id);
                  onChange(next);
                }}
              />
              <span>{person.name}</span>
            </label>
          )) : <span className="planningAssigneePickerEmpty">Geen medewerkers beschikbaar.</span>}
        </div>
      </details>
    </div>
  );
}
