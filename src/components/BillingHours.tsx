'use client';
import { useEffect, useState } from 'react';
type HourRow = { id: number; name: string; group: string; startsAt: string | null; endsAt: string | null; amount: number; hoursPerPerson: number | null; plannedHours: number | null };
type Recorded = { id: string; plannedStartsAt: string | null; plannedEndsAt: string | null; workStartedAt: string; workEndedAt: string; hours: number | null; travelMinutes: number; breakageOverTen: boolean; missingMaterials: boolean; missingMaterialsDescription: string | null; status: string };
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
  const total = rows.reduce((sum, row) => sum + (row.plannedHours || 0), 0);
  const recordedTotal = recorded.reduce((sum, row) => sum + (row.hours ?? 0), 0);
  const diff = Math.round((recordedTotal - total) * 100) / 100;
  const grouped = Object.entries(rows.reduce<Record<string, HourRow[]>>((acc, row) => {
    (acc[row.group || 'Overig'] ??= []).push(row);
    return acc;
  }, {}));
  const time = (value: string | null) => value ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  return <section className="card" style={{ padding: 12, marginBottom: 10 }}>
    <button type="button" onClick={() => setExpanded(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'transparent', border: 0, padding: 4, cursor: 'pointer', textAlign: 'left' }}>
      <strong>Personeel & uren ({rows.length} functies)</strong><span>{total.toLocaleString('nl-NL')} gepland · {recorded.length ? recordedTotal.toLocaleString('nl-NL') + ' geregistreerd' + (recorded.length === assignedCount ? ' (' + (diff >= 0 ? '+' : '') + diff.toLocaleString('nl-NL') + ')' : ' (onvolledig)') : 'nog geen sheets'} {expanded ? '▴' : '▾'}</span>
    </button>
    {expanded && <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13 }}>{status}</p>
      {loaded && <p><strong>{recorded.length} van {assignedCount} gekoppelde diensten met een ingediende sheet.</strong> {recorded.length === 0 ? 'Er zijn nog geen geregistreerde uren om te vergelijken.' : 'Totaal geregistreerd: ' + recordedTotal.toLocaleString('nl-NL') + ' uur.' + (recorded.length === assignedCount ? ' Verschil: ' + (diff >= 0 ? '+' : '') + diff.toLocaleString('nl-NL') + ' uur.' : ' Niet alle sheets zijn ingediend; verschil nog niet definitief.')}</p>}

      {grouped.map(([group, items]) => <div key={group} style={{ marginTop: 10 }}>
        <strong style={{ fontSize: 13 }}>{group}</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px,2fr) 45px 110px 65px 95px', gap: 8, fontSize: 12, padding: '6px 0', opacity: 0.7 }}>
          <span>Functie</span><span>Aantal</span><span>Begin – eind</span><span>Gepland</span><span>Geregistreerd</span>
        </div>
        {items.map(row => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px,2fr) 50px 120px 65px', gap: 8, borderTop: '1px solid var(--border, #ddd)', padding: '7px 0', fontSize: 13 }}>
          <span>{row.name}</span><span>{row.amount}×</span><span>{time(row.startsAt)} – {time(row.endsAt)}</span><strong>{row.plannedHours === null ? '—' : row.plannedHours.toLocaleString('nl-NL') + ' u'}</strong><span style={{color:'var(--muted)'}}>Zie sheets ↓</span>
        </div>)}
      </div>)}
      {recorded.length > 0 && <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border,#ddd)' }}><strong style={{ fontSize: 13 }}>Geregistreerde diensten ({recorded.length})</strong><p style={{ fontSize: 12, color: 'var(--muted)', margin: '5px 0' }}>Per ingediende sheet. De koppeling aan de exacte Rentman-functieregel ontbreekt nog; daarom tonen we geen onbetrouwbare verschillen per functie.</p>{recorded.map((report, index) => <div key={report.id} style={{ display:'grid',gridTemplateColumns:'minmax(90px,1fr) 125px 90px',gap:8,padding:'7px 0',borderTop:'1px solid var(--border,#ddd)',fontSize:13 }}><span>Sheet {index+1}</span><span>{time(report.workStartedAt)} – {time(report.workEndedAt)}</span><strong>{report.hours === null ? '—' : report.hours.toLocaleString('nl-NL')+' u'}</strong></div>)}</div>}
    </div>}
  </section>;
}
