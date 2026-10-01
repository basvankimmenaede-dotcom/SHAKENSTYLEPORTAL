'use client';

import { useMemo, useState } from 'react';
import {
  createRentmanChange,
  updateRentmanChange,
  updateRentmanChangeStatus,
} from '@/app/planning/rentman-wijzigingen/actions';

type Status = 'open' | 'in_progress' | 'completed';

type Change = {
  id: number;
  report_type: 'project_change' | 'wrong_item';
  project_number: string | null;
  project_name: string | null;
  summary: string;
  item_name: string | null;
  equipment_id: number | null;
  equipment_code: string | null;
  issue_type: string | null;
  current_value: string | null;
  desired_value: string | null;
  change_date: string | null;
  extra_notes: string | null;
  status: Status;
  created_at: string;
  reporter: string;
};

type Equipment = {
  id: number;
  name: string;
  code: string | null;
  current_quantity: number | null;
};

function statusLabel(status: Status) {
  if (status === 'in_progress') return 'In behandeling';
  if (status === 'completed') return 'Afgerond';
  return 'Open';
}

function issueLabel(value: string | null) {
  return value || 'Anders';
}

export default function RentmanChanges({
  changes,
  equipment,
}: {
  changes: Change[];
  equipment: Equipment[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Change | null>(null);
  const [type, setType] = useState<'project_change' | 'wrong_item'>('project_change');
  const [filter, setFilter] = useState<'all' | 'project_change' | 'wrong_item'>('all');
  const [query, setQuery] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [detailEquipmentId, setDetailEquipmentId] = useState('');

  const selectedEquipment = equipment.find((item) => String(item.id) === equipmentId) ?? null;
  const selectedDetailEquipment = equipment.find((item) => String(item.id) === detailEquipmentId) ?? null;

  const shown = useMemo(() => changes.filter((row) => {
    const objectLabel = row.report_type === 'project_change'
      ? `${row.project_number ?? ''} ${row.project_name ?? ''}`
      : `${row.equipment_code ?? ''} ${row.item_name ?? ''}`;
    return (filter === 'all' || row.report_type === filter)
      && `${objectLabel} ${row.summary} ${row.reporter}`.toLowerCase().includes(query.toLowerCase());
  }), [changes, filter, query]);

  return (
    <>
      <section className="rentmanChangesToolbar">
        <div className="rentmanChangeTabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Alle meldingen</button>
          <button className={filter === 'project_change' ? 'active' : ''} onClick={() => setFilter('project_change')}>Project wijziging</button>
          <button className={filter === 'wrong_item' ? 'active' : ''} onClick={() => setFilter('wrong_item')}>Voorraad / item</button>
        </div>
        <input
          className="input rentmanChangeSearch"
          placeholder="Zoeken..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </section>

      <section className="rentmanChangeTable">
        <div className="rentmanChangeTableHead">
          <span>Datum</span><span>Project / item</span><span>Type</span><span>Omschrijving</span><span>Gemeld door</span><span>Status</span>
        </div>

        {shown.map((row) => (
          <div
            className="rentmanChangeRow clickable"
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setDetail(row);
              setDetailEquipmentId(row.equipment_id == null ? '' : String(row.equipment_id));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setDetail(row);
                setDetailEquipmentId(row.equipment_id == null ? '' : String(row.equipment_id));
              }
            }}
          >
            <span>{new Date(row.created_at).toLocaleDateString('nl-NL')}</span>
            <strong>
              {row.report_type === 'project_change'
                ? `${row.project_number ?? '—'}${row.project_name ? ` · ${row.project_name}` : ''}`
                : `${row.equipment_code ? `${row.equipment_code} · ` : ''}${row.item_name ?? 'Onbekend item'}`}
            </strong>
            <span>
              <em className={row.report_type === 'wrong_item' ? 'rentmanTypeBadge wrong' : 'rentmanTypeBadge'}>
                {row.report_type === 'wrong_item' ? 'Voorraad / item' : 'Project wijziging'}
              </em>
            </span>
            <span>{row.summary}</span>
            <span>{row.reporter}</span>
            <form action={updateRentmanChangeStatus} onClick={(event) => event.stopPropagation()}>
              <input type="hidden" name="id" value={row.id} />
              <select
                name="status"
                className={`rentmanStatus ${row.status}`}
                defaultValue={row.status}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                <option value="open">Open</option>
                <option value="in_progress">In behandeling</option>
                <option value="completed">Afgerond</option>
              </select>
            </form>
          </div>
        ))}

        {!shown.length ? <div className="compactEmpty">Nog geen meldingen gevonden.</div> : null}
      </section>

      <section className="rentmanChangeInfoGrid">
        <div>
          <strong>▣ Project wijziging</strong>
          <p>Wijzigingen aan een project: tijden, aantallen, locatie, personeel, opbouw/afbouw of andere projectinformatie.</p>
        </div>
        <div className="wrong">
          <strong>◇ Voorraad / item</strong>
          <p>Fouten aan een voorraaditem zelf: beschadigd, verkeerde foto, telling aanpassen, verkeerde omschrijving of andere iteminformatie.</p>
        </div>
      </section>

      <button className="button orange rentmanNewButton" type="button" onClick={() => setCreateOpen(true)}>
        ＋ Nieuwe melding
      </button>

      {createOpen ? (
        <div
          className="planningTaskCreateBackdrop"
          data-planning-modal-open="true"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}
        >
          <section className="planningTaskCreateModal rentmanChangeModal" role="dialog" aria-modal="true">
            <button className="planningTaskCreateClose" type="button" onClick={() => setCreateOpen(false)}>×</button>
            <h2>Nieuwe melding</h2>

            <div className="rentmanTypeChoice">
              <button type="button" className={type === 'project_change' ? 'active' : ''} onClick={() => setType('project_change')}>
                <strong>▣ Project wijziging</strong>
                <small>Datum, tijd, aantal, locatie, personeel...</small>
              </button>
              <button type="button" className={type === 'wrong_item' ? 'active wrong' : ''} onClick={() => setType('wrong_item')}>
                <strong>◇ Voorraad / item</strong>
                <small>Beschadigd, verkeerde foto, telling, omschrijving...</small>
              </button>
            </div>

            <form action={createRentmanChange} className="rentmanChangeForm" onSubmit={() => setCreateOpen(false)}>
              <input type="hidden" name="report_type" value={type} />

              {type === 'project_change' ? (
                <div className="rentmanFormGrid">
                  <div className="field">
                    <label>Projectnummer</label>
                    <input className="input" name="project_number" placeholder="Bijv. 11036" required />
                  </div>
                  <div className="field">
                    <label>Projectnaam</label>
                    <input className="input" name="project_name" placeholder="Bijv. Bentley Event" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>Voorraaditem</label>
                    <select
                      className="select"
                      value={equipmentId}
                      onChange={(event) => setEquipmentId(event.target.value)}
                      required
                    >
                      <option value="">Kies item...</option>
                      {equipment.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.code ? `${item.code} · ` : ''}{item.name}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="equipment_id" value={selectedEquipment?.id ?? ''} />
                    <input type="hidden" name="equipment_code" value={selectedEquipment?.code ?? ''} />
                    <input type="hidden" name="item_name" value={selectedEquipment?.name ?? ''} />
                    {selectedEquipment?.current_quantity != null ? (
                      <small className="muted">Huidige Rentman-voorraad: {selectedEquipment.current_quantity}</small>
                    ) : null}
                  </div>

                  <div className="field">
                    <label>Wat klopt er niet?</label>
                    <select className="select" name="issue_type" defaultValue="Beschadigd">
                      <option>Beschadigd</option>
                      <option>Verkeerde foto</option>
                      <option>Nieuwe telling</option>
                      <option>Verkeerde omschrijving</option>
                      <option>Verkeerde specificatie</option>
                      <option>Anders</option>
                    </select>
                  </div>

                  <div className="rentmanFormGrid">
                    <div className="field">
                      <label>Staat nu (optioneel)</label>
                      <input className="input" name="current_value" />
                    </div>
                    <div className="field">
                      <label>Moet zijn (optioneel)</label>
                      <input className="input" name="desired_value" />
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label>{type === 'project_change' ? 'Wat is er gewijzigd?' : 'Wat is er aan de hand?'}</label>
                <textarea className="input rentmanTextarea" name="summary" placeholder="Korte omschrijving..." required />
              </div>

              <div className="rentmanFormGrid">
                <div className="field">
                  <label>Wanneer (optioneel)</label>
                  <input className="input" type="date" name="change_date" />
                </div>
                <div className="field">
                  <label>Extra toelichting (optioneel)</label>
                  <input className="input" name="extra_notes" />
                </div>
              </div>

              <div className="planningTaskCreateActions">
                <button className="button secondary" type="button" onClick={() => setCreateOpen(false)}>Annuleren</button>
                <button className="button orange" type="submit">Melding versturen</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {detail ? (
        <div
          className="planningTaskCreateBackdrop"
          data-planning-modal-open="true"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}
        >
          <section className="planningTaskCreateModal rentmanChangeModal rentmanChangeDetailModal" role="dialog" aria-modal="true">
            <button className="planningTaskCreateClose" type="button" onClick={() => setDetail(null)}>×</button>
            <div className="rentmanDetailHeader">
              <div>
                <span className="usersAdminEyebrow">Melding #{detail.id}</span>
                <h2>{detail.report_type === 'wrong_item' ? detail.item_name : detail.project_name || detail.project_number}</h2>
                <p>{detail.report_type === 'wrong_item' ? 'Voorraad / item' : 'Project wijziging'} · gemeld door {detail.reporter}</p>
              </div>
              <span className={`rentmanStatus ${detail.status}`}>{statusLabel(detail.status)}</span>
            </div>

            <form action={updateRentmanChange} className="rentmanChangeForm" onSubmit={() => setDetail(null)}>
              <input type="hidden" name="id" value={detail.id} />
              <input type="hidden" name="report_type" value={detail.report_type} />

              {detail.report_type === 'project_change' ? (
                <div className="rentmanFormGrid">
                  <div className="field">
                    <label>Projectnummer</label>
                    <input className="input" name="project_number" defaultValue={detail.project_number ?? ''} required />
                  </div>
                  <div className="field">
                    <label>Projectnaam</label>
                    <input className="input" name="project_name" defaultValue={detail.project_name ?? ''} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>Voorraaditem</label>
                    <select
                      className="select"
                      name="equipment_id"
                      value={detailEquipmentId}
                      onChange={(event) => setDetailEquipmentId(event.target.value)}
                    >
                      <option value="">Kies item...</option>
                      {equipment.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.code ? `${item.code} · ` : ''}{item.name}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="item_name" value={selectedDetailEquipment?.name ?? detail.item_name ?? ''} />
                    <input type="hidden" name="equipment_code" value={selectedDetailEquipment?.code ?? detail.equipment_code ?? ''} />
                  </div>

                  <div className="field">
                    <label>Wat klopt er niet?</label>
                    <select className="select" name="issue_type" defaultValue={detail.issue_type ?? 'Anders'}>
                      <option>Beschadigd</option>
                      <option>Verkeerde foto</option>
                      <option>Nieuwe telling</option>
                      <option>Verkeerde omschrijving</option>
                      <option>Verkeerde specificatie</option>
                      <option>Anders</option>
                    </select>
                  </div>

                  <div className="rentmanFormGrid">
                    <div className="field">
                      <label>Staat nu</label>
                      <input className="input" name="current_value" defaultValue={detail.current_value ?? ''} />
                    </div>
                    <div className="field">
                      <label>Moet zijn</label>
                      <input className="input" name="desired_value" defaultValue={detail.desired_value ?? ''} />
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label>{detail.report_type === 'project_change' ? 'Wat is er gewijzigd?' : issueLabel(detail.issue_type)}</label>
                <textarea className="input rentmanTextarea" name="summary" defaultValue={detail.summary} required />
              </div>

              <div className="rentmanFormGrid">
                <div className="field">
                  <label>Wanneer</label>
                  <input className="input" type="date" name="change_date" defaultValue={detail.change_date ?? ''} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select className="select" name="status" defaultValue={detail.status}>
                    <option value="open">Open</option>
                    <option value="in_progress">In behandeling</option>
                    <option value="completed">Afgerond</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Extra toelichting</label>
                <textarea className="input rentmanTextarea compact" name="extra_notes" defaultValue={detail.extra_notes ?? ''} />
              </div>

              <div className="rentmanDetailMeta">
                <span>Aangemaakt {new Date(detail.created_at).toLocaleString('nl-NL')}</span>
              </div>

              <div className="planningTaskCreateActions">
                <button className="button secondary" type="button" onClick={() => setDetail(null)}>Sluiten</button>
                <button className="button orange" type="submit">Wijzigingen opslaan</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
