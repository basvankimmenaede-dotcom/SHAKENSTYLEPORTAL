'use client';

import { useMemo, useState } from 'react';
import {
  addChecklistTemplateItem,
  createChecklistTemplate,
  deleteChecklistTemplateItem,
  updateChecklistTemplate,
  updateChecklistTemplateItem,
} from '@/app/planning/templates/actions';

type TaskArea = 'office' | 'warehouse' | 'both';

type ProjectType = {
  id: number;
  name: string;
};

type TemplateItem = {
  id: number;
  label: string;
  sort_order: number;
  is_required: boolean;
  deadline_offset_days: number | null;
  task_area: TaskArea;
};

type Template = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  rentman_project_type_id: number | null;
  rentman_project_type_name: string | null;
  checklist_template_items: TemplateItem[];
};

function areaLabel(area: TaskArea) {
  if (area === 'office') return 'Kantoor';
  if (area === 'warehouse') return 'Magazijn';
  return 'Beide';
}

function deadlineLabel(value: number | null) {
  if (value === null) return 'Geen To Do';
  if (value === 0) return 'Showdag';
  if (value < 0) return `${Math.abs(value)} dag${Math.abs(value) === 1 ? '' : 'en'} ervoor`;
  return `${value} dag${value === 1 ? '' : 'en'} erna`;
}

export default function ChecklistTemplatesManager({
  templates,
  projectTypes,
}: {
  templates: Template[];
  projectTypes: ProjectType[];
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? 0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [tab, setTab] = useState<'general' | 'items' | 'linking' | 'stats'>('items');

  const counts = useMemo(() => ({
    total: templates.length,
    active: templates.filter((template) => template.is_active).length,
    inactive: templates.filter((template) => !template.is_active).length,
    items: templates.reduce((sum, template) => sum + template.checklist_template_items.length, 0),
  }), [templates]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((template) => {
      const statusMatch = filter === 'all'
        || (filter === 'active' && template.is_active)
        || (filter === 'inactive' && !template.is_active);
      const queryMatch = !needle
        || template.name.toLowerCase().includes(needle)
        || (template.description ?? '').toLowerCase().includes(needle)
        || (template.rentman_project_type_name ?? '').toLowerCase().includes(needle);
      return statusMatch && queryMatch;
    });
  }, [filter, query, templates]);

  const selected = templates.find((template) => template.id === selectedId)
    ?? filtered[0]
    ?? templates[0];

  return (
    <div className="settingsEditorPane checklistAdminPage">
      <section className="checklistAdminHeader">
        <div>
          <span className="usersAdminEyebrow">Planningbeheer</span>
          <h1>Checklist-templates</h1>
          <p>Beheer projectchecklists, taaktypes en deadlines vanuit één overzicht.</p>
        </div>

        <details className="usersInvitePanel checklistCreatePanel">
          <summary className="button orange">Nieuwe template</summary>
          <form action={createChecklistTemplate} className="usersInviteForm checklistCreateForm">
            <div className="field">
              <label>Naam</label>
              <input className="input" name="name" placeholder="Bijv. Event voorbereiding" required />
            </div>
            <div className="field">
              <label>Omschrijving</label>
              <input className="input" name="description" placeholder="Optioneel" />
            </div>
            <div className="field">
              <label>Rentman-projecttype</label>
              <select className="select" name="rentman_project_type_id" defaultValue="">
                <option value="">Geen standaard projecttype</option>
                {projectTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}
              </select>
            </div>
            <button className="button orange" type="submit">Template aanmaken</button>
          </form>
        </details>
      </section>

      <section className="usersMetricGrid checklistMetricGrid">
        <div className="usersMetricCard"><span>Totaal</span><strong>{counts.total}</strong><small>templates</small></div>
        <div className="usersMetricCard active"><span>Actief</span><strong>{counts.active}</strong><small>beschikbaar in planning</small></div>
        <div className="usersMetricCard inactive"><span>Inactief</span><strong>{counts.inactive}</strong><small>niet selecteerbaar</small></div>
        <div className="usersMetricCard invited"><span>Checklist-items</span><strong>{counts.items}</strong><small>over alle templates</small></div>
      </section>

      {!selected ? (
        <div className="card compactEmpty">Nog geen checklist-templates.</div>
      ) : (
        <section className="usersWorkspace checklistWorkspace">
          <aside className="usersDirectory checklistDirectory">
            <div className="usersDirectoryTabs">
              <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Alle <b>{counts.total}</b></button>
              <button type="button" className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Actief <b>{counts.active}</b></button>
              <button type="button" className={filter === 'inactive' ? 'active' : ''} onClick={() => setFilter('inactive')}>Inactief <b>{counts.inactive}</b></button>
            </div>

            <div className="usersDirectorySearch">
              <span>⌕</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek template..." />
            </div>

            <div className="usersDirectoryList">
              {filtered.map((template) => (
                <button
                  type="button"
                  className={template.id === selected.id ? 'checklistDirectoryRow active' : 'checklistDirectoryRow'}
                  onClick={() => {
                    setSelectedId(template.id);
                    setTab('items');
                  }}
                  key={template.id}
                >
                  <span className="checklistDirectoryIcon">✓</span>
                  <span className="usersDirectoryIdentity">
                    <strong>{template.name}</strong>
                    <small>{template.rentman_project_type_name || 'Geen projecttype'} · {template.checklist_template_items.length} items</small>
                  </span>
                  <span className={template.is_active ? 'usersStatusBadge active' : 'usersStatusBadge inactive'}>
                    {template.is_active ? 'Actief' : 'Inactief'}
                  </span>
                </button>
              ))}
              {!filtered.length ? <p className="usersDirectoryEmpty">Geen templates gevonden.</p> : null}
            </div>
          </aside>

          <section className="usersDetail checklistDetail">
            <header className="usersDetailHeader checklistDetailHeader">
              <div className="usersDetailIdentity">
                <span className="usersAvatar large">✓</span>
                <div>
                  <div className="usersDetailTitle">
                    <h2>{selected.name}</h2>
                    <span className={selected.is_active ? 'usersStatusBadge active' : 'usersStatusBadge inactive'}>
                      {selected.is_active ? 'Actief' : 'Inactief'}
                    </span>
                  </div>
                  <p>{selected.description || 'Geen omschrijving'}</p>
                  <small>
                    {selected.rentman_project_type_name
                      ? `Rentman-projecttype: ${selected.rentman_project_type_name}`
                      : 'Niet gekoppeld aan een standaard projecttype'}
                  </small>
                </div>
              </div>
              <div className="checklistHeaderCount">
                <strong>{selected.checklist_template_items.length}</strong>
                <span>items</span>
              </div>
            </header>

            <nav className="usersDetailTabs">
              <button type="button" className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Algemeen</button>
              <button type="button" className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>Checklist-items</button>
              <button type="button" className={tab === 'linking' ? 'active' : ''} onClick={() => setTab('linking')}>Koppeling</button>
              <button type="button" className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>Statistieken</button>
            </nav>

            {tab === 'general' ? (
              <div className="usersDetailPanel">
                <div className="usersDetailSectionHeader">
                  <div>
                    <h3>Template-instellingen</h3>
                    <p>Naam, omschrijving en de standaardkoppeling met Rentman.</p>
                  </div>
                </div>

                <form key={`template-${selected.id}`} action={updateChecklistTemplate} className="checklistGeneralForm">
                  <input type="hidden" name="template_id" value={selected.id} />

                  <div className="field checklistGeneralName">
                    <label>Naam template</label>
                    <input className="input" name="name" defaultValue={selected.name} required />
                  </div>

                  <div className="field">
                    <label>Omschrijving</label>
                    <input className="input" name="description" defaultValue={selected.description ?? ''} placeholder="Omschrijving" />
                  </div>

                  <div className="field">
                    <label>Rentman-projecttype</label>
                    <select className="select" name="rentman_project_type_id" defaultValue={selected.rentman_project_type_id ?? ''}>
                      <option value="">Geen standaard projecttype</option>
                      {projectTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}
                    </select>
                  </div>

                  <label className="checklistActiveControl">
                    <input type="checkbox" name="is_active" defaultChecked={selected.is_active} />
                    <span>
                      <strong>Template actief</strong>
                      <small>Actieve templates kunnen aan nieuwe projectchecklists worden gekoppeld.</small>
                    </span>
                  </label>

                  <div className="usersPanelFooter">
                    <button className="button orange" type="submit">Template opslaan</button>
                  </div>
                </form>
              </div>
            ) : null}

            {tab === 'linking' ? (
              <div className="usersDetailPanel">
                <div className="usersDetailSectionHeader">
                  <div>
                    <h3>Rentman-koppeling</h3>
                    <p>Bepaal voor welk Rentman-projecttype deze checklist standaard wordt gebruikt.</p>
                  </div>
                </div>
                <form key={`link-${selected.id}`} action={updateChecklistTemplate} className="checklistLinkingForm">
                  <input type="hidden" name="template_id" value={selected.id} />
                  <input type="hidden" name="name" value={selected.name} />
                  <input type="hidden" name="description" value={selected.description ?? ''} />
                  <input type="hidden" name="is_active" value={selected.is_active ? 'on' : ''} />
                  <div className="settingsCallout">
                    <span className="settingsCalloutIcon">↔</span>
                    <div>
                      <strong>Automatische templatekeuze</strong>
                      <p>Koppel deze checklist aan een projecttype zodat de juiste template sneller wordt voorgesteld.</p>
                    </div>
                  </div>
                  <div className="field">
                    <label>Rentman-projecttype</label>
                    <select className="select" name="rentman_project_type_id" defaultValue={selected.rentman_project_type_id ?? ''}>
                      <option value="">Geen standaard projecttype</option>
                      {projectTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}
                    </select>
                  </div>
                  <div className="usersPanelFooter">
                    <button className="button orange" type="submit">Koppeling opslaan</button>
                  </div>
                </form>
              </div>
            ) : null}

            {tab === 'stats' ? (
              <div className="usersDetailPanel">
                <div className="usersDetailSectionHeader">
                  <div>
                    <h3>Template-overzicht</h3>
                    <p>Controleer in één oogopslag hoe deze checklist is opgebouwd.</p>
                  </div>
                </div>
                <div className="checklistStatsGrid">
                  <div><span>Items</span><strong>{selected.checklist_template_items.length}</strong></div>
                  <div><span>Verplicht</span><strong>{selected.checklist_template_items.filter((item) => item.is_required).length}</strong></div>
                  <div><span>Met To Do</span><strong>{selected.checklist_template_items.filter((item) => item.deadline_offset_days !== null).length}</strong></div>
                  <div><span>Magazijn / beide</span><strong>{selected.checklist_template_items.filter((item) => item.task_area !== 'office').length}</strong></div>
                </div>
                <div className="checklistStatsBreakdown">
                  <div><span>Kantoor</span><b>{selected.checklist_template_items.filter((item) => item.task_area === 'office').length}</b></div>
                  <div><span>Magazijn</span><b>{selected.checklist_template_items.filter((item) => item.task_area === 'warehouse').length}</b></div>
                  <div><span>Beide</span><b>{selected.checklist_template_items.filter((item) => item.task_area === 'both').length}</b></div>
                </div>
              </div>
            ) : null}

            {tab === 'items' ? (
              <div className="usersDetailPanel checklistItemsPanel">
                <div className="usersDetailSectionHeader">
                  <div>
                    <h3>Checklist-items</h3>
                    <p>De checklist blijft voor kantoor én magazijn zichtbaar. Taaktype bepaalt alleen in welke To Do-weergave een gekoppelde taak verschijnt.</p>
                  </div>
                </div>

                <form action={addChecklistTemplateItem} className="checklistAddItemCard">
                  <input type="hidden" name="template_id" value={selected.id} />
                  <div className="field checklistAddLabel">
                    <label>Nieuw checklist-item</label>
                    <input className="input" name="label" placeholder="Bijv. POS materiaal klaarzetten" required />
                  </div>
                  <div className="field">
                    <label>Taaktype</label>
                    <select className="select" name="task_area" defaultValue="both">
                      <option value="office">Kantoor</option>
                      <option value="warehouse">Magazijn</option>
                      <option value="both">Beide</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Deadline t.o.v. showdag</label>
                    <input className="input" name="deadline_offset_days" type="number" placeholder="Geen" />
                  </div>
                  <label className="checklistRequiredControl">
                    <input type="checkbox" name="is_required" defaultChecked />
                    <span>Verplicht</span>
                  </label>
                  <button className="button orange" type="submit">Item toevoegen</button>
                </form>

                <div className="checklistItemTable">
                  <div className="checklistItemTableHeader">
                    <span>Volgorde</span>
                    <span>Checklist-item</span>
                    <span>Taaktype</span>
                    <span>Deadline</span>
                    <span>Verplicht</span>
                    <span />
                  </div>

                  {selected.checklist_template_items.map((item) => (
                    <div className="checklistItemEditorRow" key={item.id}>
                      <form action={updateChecklistTemplateItem} className="checklistItemEditorForm">
                        <input type="hidden" name="item_id" value={item.id} />

                        <input
                          className="input checklistOrderInput"
                          type="number"
                          name="sort_order"
                          defaultValue={item.sort_order}
                          aria-label="Volgorde"
                        />

                        <div className="checklistItemNameField">
                          <input className="input" name="label" defaultValue={item.label} required />
                          <small>{deadlineLabel(item.deadline_offset_days)}</small>
                        </div>

                        <select className="select" name="task_area" defaultValue={item.task_area}>
                          <option value="office">Kantoor</option>
                          <option value="warehouse">Magazijn</option>
                          <option value="both">Beide</option>
                        </select>

                        <input
                          className="input checklistDeadlineInput"
                          type="number"
                          name="deadline_offset_days"
                          defaultValue={item.deadline_offset_days ?? ''}
                          placeholder="Geen"
                          aria-label="Deadline ten opzichte van showdag"
                        />

                        <label className="checklistRequiredControl compact">
                          <input type="checkbox" name="is_required" defaultChecked={item.is_required} />
                          <span>{item.is_required ? 'Ja' : 'Nee'}</span>
                        </label>

                        <button className="button secondary" type="submit">Opslaan</button>
                      </form>

                      <div className="checklistItemMeta">
                        <span className={`todoistArea ${item.task_area}`}>{areaLabel(item.task_area)}</span>
                        {item.deadline_offset_days !== null ? <span>Maakt automatisch een To Do-taak</span> : <span>Alleen checklist</span>}
                      </div>

                      <form action={deleteChecklistTemplateItem} className="checklistDeleteForm">
                        <input type="hidden" name="item_id" value={item.id} />
                        <button className="templateDeleteButton" type="submit">Verwijderen</button>
                      </form>
                    </div>
                  ))}

                  {!selected.checklist_template_items.length ? (
                    <div className="compactEmpty">Deze template heeft nog geen checklist-items.</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </section>
      )}
    </div>
  );
}
