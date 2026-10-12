'use client';
import { useEffect, useState } from 'react';
type HourRow = { id: number; name: string; amount: number; hoursPerPerson: number | null; plannedHours: number | null };
export default function BillingHours({ id }: { id: string }) {
  const [rows, setRows] = useState<HourRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('Uren uit Rentman laden…');
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/hours/' + encodeURIComponent(id)).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Uren ophalen mislukt'); return data; })
      .then(data => { if (active) { setRows(data.rows || []); setStatus(data.warning || 'Geregistreerde uren uit sheets nog niet gekoppeld'); } })
      .catch(e => { if (active) setStatus('Fout bij uren ophalen: ' + e.message); });
    return () => { active = false; };
  }, [id]);
  const total = rows.reduce((sum, row) => sum + (row.plannedHours || 0), 0);
  return <section className="card" style={{ padding: 12, marginBottom: 10 }}>
    <button type="button" onClick={() => setExpanded(v => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'transparent', border: 0, padding: 4, cursor: 'pointer', textAlign: 'left' }}>
      <strong>Personeel & uren ({rows.length} functies)</strong><span>{total.toLocaleString('nl-NL')} geplande uren {expanded ? '▴' : '▾'}</span>
    </button>
    {expanded && <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13 }}>{status}</p>
      {rows.map(row => <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #ddd', padding: '10px 0' }}>
        <span>{row.name} · {row.amount}× {row.hoursPerPerson === null ? 'tijd onbekend' : row.hoursPerPerson.toLocaleString('nl-NL') + ' uur'}</span>
        <strong>{row.plannedHours === null ? '—' : row.plannedHours.toLocaleString('nl-NL') + ' uur'}</strong>
      </div>)}
    </div>}
  </section>;
}
