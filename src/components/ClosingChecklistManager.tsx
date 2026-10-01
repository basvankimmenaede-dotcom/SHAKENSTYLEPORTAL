'use client';

import { useMemo, useState } from 'react';
import {
  addClosingSection,
  addClosingTemplateItem,
  deleteClosingSection,
  deleteClosingTemplateItem,
  updateClosingSection,
  updateClosingTemplateItem,
} from '@/app/planning/afsluitlijst/actions';

type Section = { id: number; name: string; sort_order: number; is_active: boolean };
type Task = {
  id: number;
  label: string;
  section_id: number | null;
  is_active: boolean;
  recurrence_type: 'daily' | 'weekly' | 'interval';
  interval_days: number | null;
  recurrence_start_date: string;
};

function frequencyLabel(task: Task) {
  if (task.recurrence_type === 'daily') return 'Dagelijks';
  if (task.recurrence_type === 'weekly') return 'Wekelijks';
  return `Elke ${task.interval_days ?? 2} dagen`;
}

export default function ClosingChecklistManager({ sections, tasks }: { sections: Section[]; tasks: Task[] }) {
  const [selectedId, setSelectedId] = useState(sections[0]?.id ?? 0);
  const [showNewSection, setShowNewSection] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showSectionSettings, setShowSectionSettings] = useState(false);
  const [newFrequency, setNewFrequency] = useState<'daily' | 'weekly' | 'interval'>('daily');
  const [editFrequency, setEditFrequency] = useState<'daily' | 'weekly' | 'interval'>('daily');

  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  const sectionTasks = useMemo(
    () => tasks.filter((task) => task.section_id === selected?.id),
    [tasks, selected?.id],
  );

  function openTaskEditor(task: Task) {
    setEditingTask(task);
    setEditFrequency(task.recurrence_type);
  }

  return (
    <section className="usersWorkspace closingManageWorkspace">
      <aside className="usersDirectory closingSectionDirectory">
        <div className="usersDirectoryTabs closingSectionTabs">
          <strong>Onderdelen</strong>
          <button type="button" onClick={() => setShowNewSection(true)}>+ Nieuwe kop</button>
        </div>
        <div className="usersDirectoryList">
          {sections.map((section) => (
            <button
              type="button"
              className={section.id === selected?.id ? 'usersDirectoryRow active' : 'usersDirectoryRow'}
              onClick={() => {
                setSelectedId(section.id);
                setShowNewTask(false);
                setEditingTask(null);
                setShowSectionSettings(false);
              }}
              key={section.id}
            >
              <span className="usersAvatar">{section.name.slice(0, 2).toUpperCase()}</span>
              <span className="usersDirectoryIdentity">
                <strong>{section.name}</strong>
                <small>{tasks.filter((task) => task.section_id === section.id && task.is_active).length} taken</small>
              </span>
            </button>
          ))}
          {!sections.length ? <p className="usersDirectoryEmpty">Maak eerst een kop aan, bijvoorbeeld Kantoor.</p> : null}
        </div>
      </aside>

      <section className="usersDetail">
        {selected ? (
          <>
            <header className="usersDetailHeader">
              <div className="usersDetailIdentity">
                <span className="usersAvatar large">{selected.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <div className="usersDetailTitle"><h2>{selected.name}</h2></div>
                  <p>Beheer de terugkerende taken binnen deze kop.</p>
                </div>
              </div>
              <div className="closingHeaderActions">
                <button className="button secondary" type="button" onClick={() => setShowSectionSettings(true)}>Kopinstellingen</button>
                <button className="button orange" type="button" onClick={() => { setNewFrequency('daily'); setShowNewTask(true); }}>Nieuwe taak</button>
              </div>
            </header>

            <div className="usersDetailPanel">
              <div className="usersDetailSectionHeader">
                <div>
                  <h3>Taken</h3>
                  <p>Alleen taken die volgens hun frequentie aan de beurt zijn verschijnen op de Afsluitlijst.</p>
                </div>
              </div>

              <div className="closingTaskListV2">
                {sectionTasks.map((task) => (
                  <article className="closingTaskCard" key={task.id}>
                    <div>
                      <strong>{task.label}</strong>
                      <span>{frequencyLabel(task)}{task.is_active ? '' : ' · Inactief'}</span>
                    </div>
                    <button className="button secondary" type="button" onClick={() => openTaskEditor(task)}>Wijzigen</button>
                  </article>
                ))}
                {!sectionTasks.length ? <div className="compactEmpty">Nog geen taken in {selected.name}.</div> : null}
              </div>
            </div>
          </>
        ) : (
          <div className="usersDetailPanel"><div className="compactEmpty">Maak links eerst een kop aan.</div></div>
        )}
      </section>

      {showNewSection ? (
        <div className="planningTaskCreateBackdrop" data-planning-modal-open="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewSection(false); }}>
          <section className="planningTaskCreateModal closingManageModal" role="dialog" aria-modal="true">
            <button className="planningTaskCreateClose" type="button" onClick={() => setShowNewSection(false)}>×</button>
            <h2>Nieuwe kop</h2>
            <p className="closingModalIntro">Bijvoorbeeld Kantoor, Spoelkeuken, Magazijn of WC.</p>
            <form action={addClosingSection} onSubmit={() => setShowNewSection(false)}>
              <div className="field"><label>Naam</label><input className="input" name="name" autoFocus required /></div>
              <div className="planningTaskCreateActions">
                <button className="button secondary" type="button" onClick={() => setShowNewSection(false)}>Annuleren</button>
                <button className="button orange" type="submit">Kop toevoegen</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showNewTask && selected ? (
        <div className="planningTaskCreateBackdrop" data-planning-modal-open="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewTask(false); }}>
          <section className="planningTaskCreateModal closingManageModal" role="dialog" aria-modal="true">
            <button className="planningTaskCreateClose" type="button" onClick={() => setShowNewTask(false)}>×</button>
            <h2>Nieuwe taak</h2>
            <p className="closingModalIntro">Toevoegen aan <strong>{selected.name}</strong>.</p>
            <form action={addClosingTemplateItem} className="closingTaskEditorV2" onSubmit={() => setShowNewTask(false)}>
              <input type="hidden" name="section_id" value={selected.id} />
              <div className="field"><label>Taak</label><input className="input" name="label" placeholder="Bijv. WC-rollen bijvullen" autoFocus required /></div>
              <div className="field">
                <label>Frequentie</label>
                <select className="select" name="recurrence_type" value={newFrequency} onChange={(event) => setNewFrequency(event.target.value as 'daily' | 'weekly' | 'interval')}>
                  <option value="daily">Dagelijks</option>
                  <option value="weekly">Wekelijks</option>
                  <option value="interval">Elke X dagen</option>
                </select>
              </div>
              {newFrequency === 'interval' ? (
                <div className="field"><label>Elke hoeveel dagen?</label><input className="input" type="number" min="2" name="interval_days" defaultValue="9" required /></div>
              ) : null}
              {newFrequency !== 'daily' ? (
                <div className="field"><label>Eerste uitvoerdag</label><input className="input" type="date" name="recurrence_start_date" defaultValue={new Date().toISOString().slice(0,10)} required /></div>
              ) : (
                <input type="hidden" name="recurrence_start_date" value={new Date().toISOString().slice(0,10)} />
              )}
              <div className="planningTaskCreateActions">
                <button className="button secondary" type="button" onClick={() => setShowNewTask(false)}>Annuleren</button>
                <button className="button orange" type="submit">Taak toevoegen</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingTask && selected ? (
        <div className="planningTaskCreateBackdrop" data-planning-modal-open="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTask(null); }}>
          <section className="planningTaskCreateModal closingManageModal" role="dialog" aria-modal="true">
            <button className="planningTaskCreateClose" type="button" onClick={() => setEditingTask(null)}>×</button>
            <h2>Taak wijzigen</h2>
            <form action={updateClosingTemplateItem} className="closingTaskEditorV2" onSubmit={() => setEditingTask(null)}>
              <input type="hidden" name="item_id" value={editingTask.id} />
              <input type="hidden" name="section_id" value={selected.id} />
              <div className="field"><label>Taak</label><input className="input" name="label" defaultValue={editingTask.label} required /></div>
              <div className="field">
                <label>Frequentie</label>
                <select className="select" name="recurrence_type" value={editFrequency} onChange={(event) => setEditFrequency(event.target.value as 'daily' | 'weekly' | 'interval')}>
                  <option value="daily">Dagelijks</option>
                  <option value="weekly">Wekelijks</option>
                  <option value="interval">Elke X dagen</option>
                </select>
              </div>
              {editFrequency === 'interval' ? (
                <div className="field"><label>Elke hoeveel dagen?</label><input className="input" type="number" min="2" name="interval_days" defaultValue={editingTask.interval_days ?? 9} required /></div>
              ) : null}
              {editFrequency !== 'daily' ? (
                <div className="field"><label>Eerste uitvoerdag</label><input className="input" type="date" name="recurrence_start_date" defaultValue={editingTask.recurrence_start_date} required /></div>
              ) : (
                <input type="hidden" name="recurrence_start_date" value={editingTask.recurrence_start_date} />
              )}
              <label className="closingTemplateActive"><input type="checkbox" name="is_active" defaultChecked={editingTask.is_active} /><span>Actief</span></label>
              <div className="closingModalFooterSplit">
                <button className="templateDeleteButton" type="submit" formAction={deleteClosingTemplateItem}>Taak verwijderen</button>
                <div className="planningTaskCreateActions">
                  <button className="button secondary" type="button" onClick={() => setEditingTask(null)}>Annuleren</button>
                  <button className="button orange" type="submit">Opslaan</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showSectionSettings && selected ? (
        <div className="planningTaskCreateBackdrop" data-planning-modal-open="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSectionSettings(false); }}>
          <section className="planningTaskCreateModal closingManageModal" role="dialog" aria-modal="true">
            <button className="planningTaskCreateClose" type="button" onClick={() => setShowSectionSettings(false)}>×</button>
            <h2>Kopinstellingen</h2>
            <form action={updateClosingSection} onSubmit={() => setShowSectionSettings(false)}>
              <input type="hidden" name="section_id" value={selected.id} />
              <div className="field"><label>Naam kop</label><input className="input" name="name" defaultValue={selected.name} required /></div>
              <div className="planningTaskCreateActions">
                <button className="button secondary" type="button" onClick={() => setShowSectionSettings(false)}>Annuleren</button>
                <button className="button orange" type="submit">Naam opslaan</button>
              </div>
            </form>
            <div className="closingDangerZone">
              <span>Deze kop verwijderen</span>
              <form action={deleteClosingSection}>
                <input type="hidden" name="section_id" value={selected.id} />
                <button className="templateDeleteButton" type="submit">Kop verwijderen</button>
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
