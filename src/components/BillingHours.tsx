'use client';
import { useEffect, useState } from 'react';
type HourRow = { id: number; name: string; amount: number; hoursPerPerson: number | null; plannedHours: number | null };
type Recorded = { id: string; hours: number | null; travelMinutes: number; breakageOverTen: boolean; missingMaterials: boolean; missingMaterialsDescription: string | null; status: string };
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
  return <section className="card" style={{ padding: 12, marginBottom: 10 }}>
    <button type="button" onClick={() => setExpanded(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'transparent', border: 0, padding: 4, cursor: 'pointer', textAlign: 'left' }}>
      <strong>Personeel & uren ({rows.length} functies)</strong><span>{total.toLocaleString('nl-NL')} gepland · {recorded.length ? recordedTotal.toLocaleString('nl-NL') + ' gewerkt (' + (diff >= 0 ? '+' : '') + diff.toLocaleString('nl-NL') + ')' : 'nog geen sheets'} {expanded ? '▴' : '▾'}</span>
    </button>
    {expanded && <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13 }}>{status}</p>
      {loaded && <p><strong>{recorded.length} van {assignedCount} gekoppelde diensten met een ingediende sheet.</strong> {recorded.length === 0 ? 'Er zijn nog geen geregistreerde uren om te vergelijken.' : 'Totaal geregistreerd: ' + recordedTotal.toLocaleString('nl-NL') + ' uur; verschil met geplande functies: ' + (diff >= 0 ? '+' : '') + diff.toLocaleString('nl-NL') + ' uur.'}</p>}
      {recorded.filter(r => r.breakageOverTen || r.missingMaterials).map(r => <p key={r.id} style={{ color: '#a94c00' }}>{r.breakageOverTen ? 'Let op: meer dan 10 glazen kapot of vermist. ' : ''}{r.missingMaterials ? 'Ontbrekend materiaal: ' + (r.missingMaterialsDescription || 'geen toelichting') : ''}</p>)}
      {rows.map(row => <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #ddd', padding: '10px 0' }}>
        <span>{row.name} · {row.amount}× {row.hoursPerPerson === null ? 'tijd onbekend' : row.hoursPerPerson.toLocaleString('nl-NL') + ' uur'}</span>
        <strong>{row.plannedHours === null ? '—' : row.plannedHours.toLocaleString('nl-NL') + ' uur'}</strong>
      </div>)}
    </div>}
  </section>;
}
