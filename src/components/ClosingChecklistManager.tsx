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
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  const sectionTasks = useMemo(
    () => tasks.filter((task) => task.section_id === selected?.id),
    [tasks, selected?.id],
  );

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
              onClick={() => { setSelectedId(section.id); setShowNewTask(false); }}
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
        {showNewSection ? (
          <div className="usersDetailPanel">
            <div className="usersDetailSectionHeader"><div><h3>Nieuwe kop</h3><p>Bijvoorbeeld Kantoor, Spoel, Magazijn of WC.</p></div></div>
            <form action={addClosingSection} className="usersProfilePanel">
              <div className="field"><label>Naam</label><input className="input" name="name" autoFocus required /></div>
              <div className="usersPanelFooter">
                <button className="button secondary" type="button" onClick={() => setShowNewSection(false)}>Annuleren</button>
                <button className="button orange" type="submit">Kop toevoegen</button>
              </div>
            </form>
          </div>
        ) : selected ? (
          <>
            <header className="usersDetailHeader">
              <div className="usersDetailIdentity">
                <span className="usersAvatar large">{selected.name.slice(0, 2).toUpperCase()}</span>
                <div><div className="usersDetailTitle"><h2>{selected.name}</h2></div><p>Beheer de terugkerende taken binnen deze kop.</p></div>
              </div>
              <button className="button orange" type="button" onClick={() => setShowNewTask(true)}>Nieuwe taak</button>
            </header>

            <div className="usersDetailPanel">
              <div className="usersDetailSectionHeader"><div><h3>Taken</h3><p>Alleen taken die volgens hun frequentie vandaag aan de beurt zijn verschijnen op de Afsluitlijst.</p></div></div>

              {showNewTask ? (
                <form action={addClosingTemplateItem} className="closingTaskEditor">
                  <input type="hidden" name="section_id" value={selected.id} />
                  <div className="field"><label>Taak</label><input className="input" name="label" placeholder="Bijv. WC-rollen bijvullen" required /></div>
                  <div className="field">
                    <label>Frequentie</label>
                    <select className="select" name="recurrence_type" defaultValue="daily">
                      <option value="daily">Dagelijks</option>
                      <option value="weekly">Wekelijks</option>
                      <option value="interval">Elke X dagen</option>
                    </select>
                  </div>
                  <div className="field"><label>Aantal dagen (alleen bij Elke X dagen)</label><input className="input" type="number" min="2" name="interval_days" defaultValue="9" /></div>
                  <div className="field"><label>Start / eerste uitvoerdag</label><input className="input" type="date" name="recurrence_start_date" defaultValue={new Date().toISOString().slice(0,10)} /></div>
                  <div className="usersPanelFooter">
                    <button className="button secondary" type="button" onClick={() => setShowNewTask(false)}>Annuleren</button>
                    <button className="button orange" type="submit">Taak toevoegen</button>
                  </div>
                </form>
              ) : null}

              <div className="usersPermissionsTable closingTaskList">
                {sectionTasks.map((task) => (
                  <details className="closingTaskManageRow" key={task.id}>
                    <summary className="usersPermissionRow">
                      <div><strong>{task.label}</strong><small>{frequencyLabel(task)}{task.is_active ? '' : ' · Inactief'}</small></div>
                      <span className="button secondary">Wijzigen</span>
                    </summary>
                    <form action={updateClosingTemplateItem} className="closingTaskEditor">
                      <input type="hidden" name="item_id" value={task.id} />
                      <input type="hidden" name="section_id" value={selected.id} />
                      <div className="field"><label>Taak</label><input className="input" name="label" defaultValue={task.label} required /></div>
                      <div className="field"><label>Frequentie</label><select className="select" name="recurrence_type" defaultValue={task.recurrence_type}><option value="daily">Dagelijks</option><option value="weekly">Wekelijks</option><option value="interval">Elke X dagen</option></select></div>
                      <div className="field"><label>Aantal dagen</label><input className="input" type="number" min="2" name="interval_days" defaultValue={task.interval_days ?? 9} /></div>
                      <div className="field"><label>Start / eerste uitvoerdag</label><input className="input" type="date" name="recurrence_start_date" defaultValue={task.recurrence_start_date} /></div>
                      <label className="closingTemplateActive"><input type="checkbox" name="is_active" defaultChecked={task.is_active} /><span>Actief</span></label>
                      <div className="usersPanelFooter"><button className="button orange" type="submit">Opslaan</button></div>
                    </form>
                    <form action={deleteClosingTemplateItem} className="closingDeleteForm"><input type="hidden" name="item_id" value={task.id} /><button className="templateDeleteButton" type="submit">Taak verwijderen</button></form>
                  </details>
                ))}
                {!sectionTasks.length ? <div className="compactEmpty">Nog geen taken in {selected.name}.</div> : null}
              </div>

              <details className="closingSectionSettings">
                <summary>Instellingen van deze kop</summary>
                <form action={updateClosingSection} className="closingTaskEditor">
                  <input type="hidden" name="section_id" value={selected.id} />
                  <div className="field"><label>Naam kop</label><input className="input" name="name" defaultValue={selected.name} required /></div>
                  <div className="usersPanelFooter"><button className="button orange" type="submit">Naam opslaan</button></div>
                </form>
                <form action={deleteClosingSection}><input type="hidden" name="section_id" value={selected.id} /><button className="templateDeleteButton" type="submit">Kop verwijderen</button></form>
              </details>
            </div>
          </>
        ) : (
          <div className="usersDetailPanel"><div className="compactEmpty">Maak links eerst een kop aan.</div></div>
        )}
      </section>
    </section>
  );
}
