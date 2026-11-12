'use client';
import { useEffect, useState } from 'react';
type Check = { key: string; title: string; detail: string; delta?: number };
export default function BillingChecks({ id, canManage, locked }: { id: string; canManage: boolean; locked: boolean }) {
  const [resolved, setResolved] = useState<string[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    fetch('/api/planning/billing/hours/' + encodeURIComponent(id))
      .then(async r => { const x = await r.json(); if (!r.ok) throw new Error(x.error || 'Sheets ophalen mislukt');
        const list: Check[] = [];
        for (const report of x.recorded || []) {
          const reporter = String(report.crewMemberName || 'Onbekende medewerker');
          if (report.breakageOverTen) list.push({ key: 'breakage:' + report.id, title: 'Meer dan 10 glazen kapot of vermist · ' + reporter, detail: 'Gemeld in een ingediend shiftrapport' });
          if (report.missingMaterials) list.push({ key: 'missing:' + report.id, title: 'Ontbrekend materiaal · ' + reporter, detail: report.missingMaterialsDescription || 'Geen toelichting opgegeven' });
          if (Number(report.expensesAmount || 0) > 0 || String(report.expensesDescription || '').trim()) list.push({ key: 'expenses:' + report.id, title: 'Extra kosten · ' + reporter + (Number(report.expensesAmount || 0) > 0 ? ': ' + Number(report.expensesAmount).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) : ''), detail: String(report.expensesDescription || '').trim() || 'Geen omschrijving opgegeven' });
          if (String(report.notes || '').trim()) list.push({ key: 'notes:' + report.id, title: 'Opmerking shiftrapport · ' + reporter, detail: String(report.notes).trim() });
        }
        setChecks(list);
      }).catch(e => setError(e.message));
    fetch('/api/planning/billing/checks/' + encodeURIComponent(id))
      .then(async r => { const x = await r.json(); if (!r.ok) throw new Error(x.error); setResolved(x.resolved || []); })
      .catch(e => setError(e.message));
  }, [id]);
  async function toggle(key: string, value: boolean) {
    setBusy(key); setError('');
    try {
      const r = await fetch('/api/planning/billing/checks/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, resolved: value }) });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error);
      setResolved(previous => value ? [...previous, key] : previous.filter(k => k !== key));
    } catch (e) { setError(e instanceof Error ? e.message : 'Opslaan mislukt'); }
    finally { setBusy(''); }
  }
  const open = checks.filter(c => !resolved.includes(c.key));
  const done = checks.filter(c => resolved.includes(c.key));
  return <aside className="card" style={{ padding: 16, alignSelf: 'start' }}>
    <h3 style={{ marginTop: 0 }}>Controlepunten {open.length > 0 ? '(' + open.length + ')' : ''}</h3>
    {open.length === 0 && <p style={{ fontSize: 13, marginBottom: 8 }}>Geen openstaande meldingen.</p>}
    {open.map(c => <label key={c.key} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #ddd' }}>
      <input type="checkbox" checked={false} disabled={!canManage || locked || busy === c.key} onChange={() => toggle(c.key, true)} />
      <span style={{ flex: 1 }}><strong>{c.title}</strong>{c.delta !== undefined && <strong style={{ float: 'right' }}>{c.delta > 0 ? '+' : ''}{c.delta} uur</strong>}<small style={{ display: 'block', marginTop: 4 }}>{c.detail}</small></span>
    </label>)}
    {done.length > 0 && <><button type="button" className="button secondary" onClick={() => setShowResolved(v => !v)}>Afgehandeld ({done.length})</button>
      {showResolved && done.map(c => <label key={c.key} style={{ display: 'flex', gap: 8, marginTop: 8 }}><input type="checkbox" checked disabled={!canManage || locked || busy === c.key} onChange={() => toggle(c.key, false)} />{c.title}</label>)}</>}

    {error && <p role="alert">{error}</p>}
  </aside>;
}