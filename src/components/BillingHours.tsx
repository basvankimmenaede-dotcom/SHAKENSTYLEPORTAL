'use client';
import { useEffect, useState } from 'react';
type HourRow = { id: number; type: string | null; name: string; group: string; startsAt: string | null; endsAt: string | null; amount: number; hoursPerPerson: number | null; plannedHours: number | null; plannedTravelOutHours: number; plannedTravelBackHours: number };
type Recorded = { id: string; functionId: number | null; plannedStartsAt: string | null; plannedEndsAt: string | null; workStartedAt: string; workEndedAt: string; hours: number | null; travelMinutes: number; breakageOverTen: boolean; missingMaterials: boolean; missingMaterialsDescription: string | null; status: string };
export default function BillingHours({ id }: { id: string }) {
  const [rows, setRows] = useState<HourRow[]>([]);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('Uren uit Rentman laden…');
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/hours/' + encodeURIComponent(id)).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Uren ophalen mislukt'); return data; })
      .then(data => { if (active) { setRows(data.rows || []); setRecorded(data.recorded || []); setAssignedCount(data.assignedCount || 0); setLoaded(true); setStatus(data.warning || ''); } })
      .catch(e => { if (active) setStatus('Fout bij uren ophalen: ' + e.message); });
    return () => { active = false; };
  }, [id]);
  const personnelRows = rows.filter(row => row.type !== 'vehicle_function' && !/^(bakwagen|bestelbus|bestelauto|transport bestelbus|transport bakwagen|vrachtwagen|auto\\b)/i.test(row.name));
  const total = personnelRows.reduce((sum, row) => sum + (row.plannedHours || 0), 0);
  const travelTotal = personnelRows.reduce((sum,row)=>sum+row.plannedTravelOutHours+row.plannedTravelBackHours,0);
  const recordedTotal = recorded.reduce((sum, row) => sum + (row.hours ?? 0), 0);
  const diff = Math.round((recordedTotal - total) * 100) / 100;
  const mapped = recorded.filter(r => r.functionId !== null && personnelRows.some(row => row.id === r.functionId));
  const unlinked = recorded.filter(r => r.functionId === null || !rows.some(row => row.id === r.functionId));
  const grouped = Object.entries(personnelRows.reduce<Record<string, HourRow[]>>((acc, row) => {
    (acc[row.group || 'Overig'] ??= []).push(row);
    return acc;
  }, {}));
  const time = (value: string | null) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  return <section className="card" style={{ padding: 12, marginBottom: 10 }}>
    <button type="button" onClick={() => setExpanded(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'transparent', border: 0, padding: 4, cursor: 'pointer', textAlign: 'left' }}>
      <strong>Personeel & uren ({personnelRows.length} functies)</strong><span>{total.toLocaleString('nl-NL')} werk gepland · {travelTotal.toLocaleString('nl-NL')} reis · {recorded.length ? recordedTotal.toLocaleString('nl-NL') + ' geregistreerd' + (recorded.length === assignedCount ? ' (' + (diff >= 0 ? '+' : '') + diff.toLocaleString('nl-NL') + ')' : ' (onvolledig)') : 'nog geen sheets'} {expanded ? '▴' : '▾'}</span>
    </button>
    {expanded && <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13 }}>{status}</p>
      {loaded && <p><strong>{recorded.length} van {assignedCount} gekoppelde diensten met een ingediende sheet.</strong> {recorded.length === 0 ? 'Er zijn nog geen geregistreerde uren om te vergelijken.' : 'Totaal geregistreerd: ' + recordedTotal.toLocaleString('nl-NL') + ' uur.' + (recorded.length === assignedCount ? ' Verschil: ' + (diff >= 0 ? '+' : '') + diff.toLocaleString('nl-NL') + ' uur.' : ' Niet alle sheets zijn ingediend; verschil nog niet definitief.')}</p>}

      {grouped.map(([group, items]) => <div key={group} style={{ marginTop: 16 }}>
        <strong style={{ fontSize: 13 }}>{group}</strong>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 730 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,2fr) 42px 95px 65px 65px 65px 75px 70px', gap: 8, fontSize: 12, padding: '7px 0', opacity: 0.7 }}>
              <span>Functie</span><span>Aantal</span><span>Begin – eind</span><span>Werk plan</span><span>Reis heen</span><span>Reis terug</span><span>Werk echt</span><span>Verschil werk</span>
            </div>
            {items.map(row => {
              const sheets = mapped.filter(report => report.functionId === row.id);
              const hours = sheets.reduce((sum, report) => sum + (report.hours ?? 0), 0);
              const complete = sheets.length >= row.amount && sheets.every(report => report.hours !== null);
              const difference = row.plannedHours === null || sheets.length === 0 || sheets.some(report => report.hours === null) ? null : Math.round((hours - row.plannedHours) * 100) / 100;
              return <div key={row.id} style={{ borderTop: '1px solid var(--border,#ddd)', padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px,2fr) 48px 115px 75px 100px 80px', gap: 8, fontSize: 13, alignItems: 'center' }}>
                  <span>{row.name}</span><span>{row.amount}×</span><span>{time(row.startsAt)} – {time(row.endsAt)}</span>
                  <strong>{row.plannedHours === null ? '—' : row.plannedHours.toLocaleString('nl-NL') + ' u'}</strong>
                  <span>{row.plannedTravelOutHours.toLocaleString('nl-NL')} u</span><span>{row.plannedTravelBackHours.toLocaleString('nl-NL')} u</span><strong>{sheets.length ? hours.toLocaleString('nl-NL') + ' u' : 'Geen sheet'}</strong>
                  <strong>{difference === null ? '—' : (difference > 0 ? '+' : '') + difference.toLocaleString('nl-NL') + ' u' + (!complete ? ' *' : '')}</strong>
                </div>
                {(row.plannedTravelOutHours + row.plannedTravelBackHours) > 0 && <small style={{display:'block',color:'var(--muted)'}}>Totaal inclusief Rentman-reistijd: {((row.plannedHours || 0)+row.plannedTravelOutHours+row.plannedTravelBackHours).toLocaleString('nl-NL')} u (gepland werk + reis).</small>}
                {difference !== null && !complete && <small style={{display:'block',color:'var(--muted)'}}> * Voorlopig verschil; nog niet alle sheets zijn ingediend.</small>}
                {sheets.length > 0 && <details style={{ marginTop: 6, fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Bekijk {sheets.length} {sheets.length === 1 ? 'sheet' : 'sheets'}{!complete ? ' · nog niet compleet' : ''}</summary>
                  {sheets.map(sheet => <div key={sheet.id} style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border,#ddd)' }}>
                    <span>{time(sheet.workStartedAt)} – {time(sheet.workEndedAt)}</span>
                    <strong>{sheet.hours === null ? '—' : sheet.hours.toLocaleString('nl-NL') + ' u'}</strong>
                  </div>)}
                </details>}
                {sheets.length < row.amount && <small style={{ color: 'var(--muted)' }}>{row.amount - sheets.length} {row.amount - sheets.length === 1 ? 'sheet' : 'sheets'} nog niet ingediend of gekoppeld</small>}
              </div>;
            })}
          </div>
        </div>
      </div>)}
      {unlinked.length > 0 && <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border,#ddd)' }}>
        <strong style={{ fontSize: 13 }}>Niet aan Rentman-functie gekoppelde sheets ({unlinked.length})</strong>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Deze uren tellen wel mee in het totaal, maar niet in een functieverschil.</p>
        {unlinked.map(sheet => <div key={sheet.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', fontSize: 13 }}>
          <span>{time(sheet.workStartedAt)} – {time(sheet.workEndedAt)}</span>
          <strong>{sheet.hours === null ? '—' : sheet.hours.toLocaleString('nl-NL') + ' u'}</strong>
        </div>)}
      </div>}
    </div>}
  </section>;
}
