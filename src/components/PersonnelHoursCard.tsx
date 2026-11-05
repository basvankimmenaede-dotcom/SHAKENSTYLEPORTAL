'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock3, Settings2, X } from 'lucide-react';

type Row = {
  crewId: number;
  name: string;
  weeklyHours: number;
  trackingStartWeek: string;
  openingBalanceHours: number;
  workedHours: number;
  creditedHours: number;
  leaveHours: number;
  previousWeekHours: number;
  contractDifference: number;
  previousWeekDifference: number;
  cumulativeBalance: number | null;
  overtimeWarning: boolean;
};
type Contract = {
  rentman_crew_id: number;
  weekly_hours: number;
  tracking_start_week: string;
  opening_balance_hours: number;
  is_active: boolean;
};
type Data = {
  week: string;
  currentWeek: string;
  isCurrentWeek: boolean;
  rows: Row[];
  contracts: Contract[];
  crew: { id: number; name: string; active: boolean }[];
  summary: {
    workedHours: number;
    creditedHours: number;
    contractDifference: number;
    previousWeekDifference: number;
    warnings: number;
  };
};
type ContractEditor = {
  crewId: string;
  weeklyHours: string;
  trackingStartWeek: string;
  openingBalanceHours: string;
};
const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });
function numberLabel(num: number) { return nf.format(num); }
function signed(num: number) { return (num > 0 ? '+' : '') + numberLabel(num) + ' u'; }
function weekShift(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}
function weekLabel(week: string) {
  const start = new Date(week + 'T12:00:00Z');
  const end = new Date(weekShift(week, 6) + 'T12:00:00Z');
  const fmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return fmt.format(start) + ' – ' + fmt.format(end);
}
function hoursClass(value: number) { return value > 0 ? 'staffHoursPositive' : value < 0 ? 'staffHoursNegative' : ''; }

export default function PersonnelHoursCard() {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [editor, setEditor] = useState<ContractEditor>({
    crewId: '', weeklyHours: '', trackingStartWeek: '', openingBalanceHours: '0',
  });

  const load = useCallback(async (requestedWeek?: string) => {
    setLoading(true);
    setError('');
    try {
      const q = requestedWeek ? '?week=' + encodeURIComponent(requestedWeek) : '';
      const response = await fetch('/api/planning/personnel-hours' + q, { cache: 'no-store' });
      const body = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Uren konden niet worden geladen.');
      setData(body);
      setWeek(body.week);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Uren konden niet worden geladen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function startEdit(contract?: Contract) {
    setSaveMessage('');
    setEditing(true);
    setEditor({
      crewId: String(contract?.rentman_crew_id ?? ''),
      weeklyHours: contract ? String(contract.weekly_hours) : '',
      trackingStartWeek: contract?.tracking_start_week ?? data?.currentWeek ?? '',
      openingBalanceHours: String(contract?.opening_balance_hours ?? 0),
    });
  }

  async function saveContract(active: boolean) {
    if (!editor.crewId) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const response = await fetch('/api/planning/personnel-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewId: Number(editor.crewId),
          weeklyHours: Number(editor.weeklyHours),
          openingBalanceHours: Number(editor.openingBalanceHours || '0'),
          trackingStartWeek: editor.trackingStartWeek,
          active,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Opslaan is mislukt.');
      setEditing(false);
      await load(week);
      setSaveMessage('Contractinstellingen opgeslagen.');
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : 'Opslaan is mislukt.');
    } finally {
      setSaving(false);
    }
  }

  const summary = data?.summary;
  const hasContracts = Boolean(data?.contracts.some((contract) => contract.is_active));
  const weekIndex = week ? Math.ceil((new Date(week + 'T12:00:00Z').getTime() - new Date(new Date(week + 'T12:00:00Z').getUTCFullYear() + '-01-01T12:00:00Z').getTime()) / 604800000) : 0;

  return (
    <>
      <button type="button" className="planningMetricCard staffHoursMetric" onClick={() => { setOpen(true); setEditing(false); setSaveMessage(''); }}>
        <span className="planningMetricIcon crew"><Clock3 size={19} aria-hidden /></span>
        <div>
          <small>Personeelsuren</small>
          <strong>{loading && !data ? '…' : hasContracts ? (numberLabel(summary?.workedHours ?? 0) + ' u') : 'Instellen'}</strong>
          <em>
            {error ? 'Kan niet laden' :
              hasContracts ? (
                <span className={hoursClass(summary?.contractDifference ?? 0)}>
                  {signed(summary?.contractDifference ?? 0)} t.o.v. contract
                </span>
              ) : 'Contracturen koppelen'}
          </em>
        </div>
      </button>

      {open ? (
        <div className="staffHoursBackdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="staffHoursModal" role="dialog" aria-modal="true" aria-label="Urenregistratie personeel">
            <header className="staffHoursModalHeader">
              <div>
                <span className="eyebrowLink">Personeel · Rentman</span>
                <h2>Urenregistratie</h2>
                <p>Gewerkte uren, contractverschil en ontwikkeling per week.</p>
              </div>
              <button type="button" className="staffHoursIconButton" onClick={() => setOpen(false)} aria-label="Sluiten">
                <X size={20} />
              </button>
            </header>

            <div className="staffHoursControls">
              <div className="staffHoursWeek">
                <button type="button" className="staffHoursIconButton" disabled={loading || !week || week <= '2024-01-01'} onClick={() => void load(weekShift(week, -7))} aria-label="Vorige week"><ChevronLeft size={18}/></button>
                <div><strong>{week ? weekLabel(week) : 'Week laden…'}</strong><small>{data?.isCurrentWeek ? 'Lopende week · voorlopig' : 'Afgesloten week'}{weekIndex ? ' · week ' + weekIndex : ''}</small></div>
                <button type="button" className="staffHoursIconButton" disabled={loading || !data || week >= data.currentWeek} onClick={() => void load(weekShift(week, 7))} aria-label="Volgende week"><ChevronRight size={18}/></button>
              </div>
              <div className="staffHoursActions">
                <button type="button" className="button secondary" onClick={() => startEdit()}><Settings2 size={15}/> Contracturen beheren</button>
              </div>
            </div>

            {error ? <div className="notice">{error} <button type="button" onClick={() => void load(week)}>Opnieuw proberen</button></div> : null}
            {saveMessage ? <div className="notice">{saveMessage}</div> : null}

            {data ? (
              <>
                <div className="staffHoursSummary">
                  <div><small>Gewerkt</small><strong>{numberLabel(summary?.workedHours ?? 0)} u</strong></div>
                  <div><small>T.o.v. contract</small><strong className={hoursClass(summary?.contractDifference ?? 0)}>{signed(summary?.contractDifference ?? 0)}</strong></div>
                  <div><small>T.o.v. vorige week</small><strong>{signed(summary?.previousWeekDifference ?? 0)}</strong></div>
                </div>
                {summary && summary.warnings > 0 ? (
                  <div className="staffHoursAlert"><AlertTriangle size={17}/> {summary.warnings} medewerker{summary.warnings === 1 ? '' : 's'} meer dan 5 uur boven contract deze week.</div>
                ) : null}
                {!hasContracts ? <div className="staffHoursEmpty">Koppel eerst vaste medewerkers met hun contracturen via <strong>Contracturen beheren</strong>.</div> : null}
                {hasContracts ? (
                  <div className="staffHoursTableScroll">
                    <table className="staffHoursTable">
                      <thead><tr>
                        <th>Medewerker</th><th>Gewerkt</th><th>Contract ±</th><th>Vorige week ±</th><th>Saldo</th><th></th>
                      </tr></thead>
                      <tbody>{data.rows.map((person) => (
                        <tr key={person.crewId}>
                          <td><strong>{person.name}</strong>{person.leaveHours ? <small>{numberLabel(person.leaveHours)} u verlof/ziekte</small> : null}</td>
                          <td>{numberLabel(person.workedHours)} u</td>
                          <td className={hoursClass(person.contractDifference)}>{person.trackingStartWeek <= week ? signed(person.contractDifference) : '—'}{person.overtimeWarning ? <AlertTriangle size={14} aria-label="Meer dan vijf overuren"/> : null}</td>
                          <td>{signed(person.previousWeekDifference)}</td>
                          <td className={hoursClass(person.cumulativeBalance ?? 0)}>{person.cumulativeBalance === null ? '—' : signed(person.cumulativeBalance)}</td>
                          <td><button className="staffHoursIconButton" type="button" title="Contracturen aanpassen" onClick={() => startEdit(data.contracts.find((c) => c.rentman_crew_id === person.crewId))}><Settings2 size={15}/></button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : null}
                <p className="staffHoursNote">
                  Contract ± = gewerkte uren plus geregistreerd verlof/ziekte en correcties, minus de weeknorm.
                  Vorige week ± vergelijkt uitsluitend gewerkte uren.
                  Saldo = beginsaldo plus afgeronde weken vanaf de ingestelde startweek{data.isCurrentWeek ? ' (lopende week telt nog niet mee)' : ''}.
                </p>
              </>
            ) : loading ? <div className="staffHoursEmpty">Rentman-uren laden…</div> : null}

            {editing && data ? (
              <div className="staffHoursEditor">
                <div className="staffHoursEditorHeader"><h3>Contracturen beheren</h3><button type="button" className="staffHoursIconButton" onClick={() => setEditing(false)} aria-label="Beheer sluiten"><X size={17}/></button></div>
                <div className="staffHoursFields">
                  <label>Medewerker
                    <select className="select" value={editor.crewId} onChange={(event) => {
                      const id = event.target.value;
                      const item = data.contracts.find((c) => String(c.rentman_crew_id) === id);
                      setEditor({
                        crewId: id,
                        weeklyHours: item ? String(item.weekly_hours) : '',
                        trackingStartWeek: item?.tracking_start_week ?? data.currentWeek,
                        openingBalanceHours: String(item?.opening_balance_hours ?? 0),
                      });
                    }}>
                      <option value="">Selecteer medewerker</option>
                      {data.crew.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      {data.contracts.filter((contract) => !data.crew.some((person) => person.id === contract.rentman_crew_id))
                        .map((contract) => <option key={contract.rentman_crew_id} value={contract.rentman_crew_id}>Crew #{contract.rentman_crew_id}</option>)}
                    </select>
                  </label>
                  <label>Contracturen per week
                    <input className="input" type="number" min="0.01" max="80" step="0.25" value={editor.weeklyHours} onChange={(event) => setEditor({ ...editor, weeklyHours: event.target.value })}/>
                  </label>
                  <label>Startweek (maandag)
                    <input className="input" type="date" max={data.currentWeek} value={editor.trackingStartWeek} onChange={(event) => setEditor({ ...editor, trackingStartWeek: event.target.value })}/>
                  </label>
                  <label>Beginsaldo (uur)
                    <input className="input" type="number" step="0.25" value={editor.openingBalanceHours} onChange={(event) => setEditor({ ...editor, openingBalanceHours: event.target.value })}/>
                  </label>
                </div>
                <p className="staffHoursNote">De norm en het beginsaldo gelden vanaf de startweek. Bij latere contractwijzigingen kan een nieuwe startweek en beginsaldo worden ingesteld.</p>
                <div className="staffHoursEditorFooter">
                  {data.contracts.some((c) => String(c.rentman_crew_id) === editor.crewId && c.is_active) ? (
                    <button type="button" className="button secondary" disabled={saving} onClick={() => void saveContract(false)}>Niet meer volgen</button>
                  ) : null}
                  <button type="button" className="button orange" disabled={saving || !editor.crewId || !editor.weeklyHours} onClick={() => void saveContract(true)}>{saving ? 'Opslaan…' : 'Contract opslaan'}</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
