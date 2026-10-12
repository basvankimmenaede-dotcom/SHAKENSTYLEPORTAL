'use client';
import Link from 'next/link';
import BillingProductUsage from './BillingProductUsage';
import BillingChecks from './BillingChecks';
import BillingHours from './BillingHours';
import { useEffect, useMemo, useState } from 'react';

type Line = { description: string; quantity: number; unitPrice: number; vatRate: number };
type Draft = { reference: string; customer_name: string; customer_email: string; customer_address: string; description: string; notes: string; lines: Line[] };
type Item = { project_name: string; customer_name: string | null; rentman_project_number: string | null; status: string };
const blank = (): Line => ({ description: '', quantity: 1, unitPrice: 0, vatRate: 21 });
const money = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

export default function BillingDraftEditor({ id, canManage }: { id: string; canManage: boolean }) {
  const [item, setItem] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Draft>({ reference: '', customer_name: '', customer_email: '', customer_address: '', description: '', notes: '', lines: [blank()] });
  const [state, setState] = useState('Laden…');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/drafts/' + encodeURIComponent(id))
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Laden mislukt'); return data; })
      .then(({ item, draft: saved }) => {
        if (!active) return;
        setItem(item);
        setDraft({ reference: saved?.reference || '', customer_name: saved?.customer_name || item.customer_name || '',
          customer_email: saved?.customer_email || '', customer_address: saved?.customer_address || '',
          description: saved?.description || '', notes: saved?.notes || '', lines: saved?.lines?.length ? saved.lines : [blank()] });
        setState('');
      }).catch(e => { if (active) setState(e.message); });
    return () => { active = false; };
  }, [id]);
  const totals = useMemo(() => draft.lines.reduce((a, l) => {
    const net = Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * 100) / 100;
    const vat = Math.round(net * (Number(l.vatRate) || 0)) / 100;
    return { net: a.net + net, vat: a.vat + vat };
  }, { net: 0, vat: 0 }), [draft.lines]);
  function change(key: keyof Omit<Draft, 'lines'>, value: string) {
    setDraft(d => ({ ...d, [key]: value })); setState('Niet-opgeslagen wijzigingen');
  }
  function changeLine(index: number, key: keyof Line, value: string) {
    setDraft(d => ({ ...d, lines: d.lines.map((l, i) => i === index ? { ...l, [key]: key === 'description' ? value : Number(value) } : l) }));
    setState('Niet-opgeslagen wijzigingen');
  }
  async function save() {
    setSaving(true); setState('Concept wordt opgeslagen…');
    try {
      const response = await fetch('/api/planning/billing/drafts/' + encodeURIComponent(id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Opslaan mislukt');
      setState('✓ Concept succesvol opgeslagen');
    } catch (e) { setState('Opslaan mislukt: ' + (e instanceof Error ? e.message : 'Onbekende fout')); }
    finally { setSaving(false); }
  }
  return <main className="container" style={{ maxWidth: 1050, paddingBottom: 60 }}>
    <Link href="/planning/billing">← Terug naar facturatie</Link>
    <h1>Projectafrekening</h1>
    {item && <p><strong>{item.rentman_project_number ? '#' + item.rentman_project_number + ' · ' : ''}{item.project_name}</strong> · {item.status === 'invoiced' ? 'Gefactureerd (vergrendeld)' : 'Concept'}</p>}
    {!item ? <p role="status">{state}</p> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' }}><div style={{ minWidth: 0 }}>
      <section className="card" style={{ padding: 12, marginBottom: 10 }}>
        <strong>Klant: {draft.customer_name || item.customer_name || "Onbekend"}</strong>
        <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer" }}>Factuurgegevens bewerken</summary>
        {([['customer_name', 'Klant'], ['customer_email', 'E-mailadres'], ['customer_address', 'Factuuradres'], ['reference', 'Referentie / PO-nummer'], ['description', 'Factuuromschrijving']] as const).map(([key, label]) =>
          <div className="field" key={key}><label htmlFor={key}>{label}</label>
            <input className="input" id={key} value={draft[key]} disabled={!canManage || item.status === 'invoiced'} onChange={e => change(key, e.target.value)} /></div>)}
        </details>
      </section>
      <BillingHours id={id} />
      <BillingProductUsage id={id} canManage={canManage} locked={item.status === 'invoiced'} />
      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2>Overige factuurregels</h2>
        {draft.lines.map((line, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 3fr) 85px 110px 95px auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
          <div className="field"><label>Omschrijving</label><input className="input" aria-label={'Omschrijving regel ' + (i + 1)} value={line.description} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'description', e.target.value)} /></div>
          <div className="field"><label>Aantal</label><input className="input" type="number" min="0" step="0.01" value={line.quantity} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'quantity', e.target.value)} /></div>
          <div className="field"><label>Prijs excl.</label><input className="input" type="number" min="0" step="0.01" value={line.unitPrice} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'unitPrice', e.target.value)} /></div>
          <div className="field"><label>Btw</label><select className="input" value={line.vatRate} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'vatRate', e.target.value)}><option value={21}>21%</option><option value={9}>9%</option><option value={0}>0%</option></select></div>
          <button type="button" className="button secondary" disabled={!canManage || item.status === 'invoiced' || draft.lines.length === 1} onClick={() => { setDraft(d => ({ ...d, lines: d.lines.filter((_, n) => n !== i) })); setState('Niet-opgeslagen wijzigingen'); }}>×</button>
        </div>)}
        <button type="button" className="button secondary" disabled={!canManage || item.status === 'invoiced'} onClick={() => { setDraft(d => ({ ...d, lines: [...d.lines, blank()] })); setState('Niet-opgeslagen wijzigingen'); }}>+ Factuurregel</button>
        <p style={{ textAlign: 'right' }}>Excl. btw: <strong>{money(totals.net)}</strong></p>
        <p style={{ textAlign: 'right' }}>Btw: <strong>{money(totals.vat)}</strong></p>
        <p style={{ textAlign: 'right', fontSize: 20 }}>Totaal incl. btw: <strong>{money(totals.net + totals.vat)}</strong></p>
      </section>
      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="field"><label htmlFor="notes">Interne notities</label><textarea id="notes" className="input" value={draft.notes} disabled={!canManage || item.status === 'invoiced'} onChange={e => change('notes', e.target.value)} /></div>
      </section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {canManage && item.status !== 'invoiced' && <button type="button" className="button orange" disabled={saving} onClick={save}>{saving ? 'Opslaan…' : 'Concept opslaan'}</button>}
        <span role="status" aria-live="polite">{state}</span>
      </div>
      </div><BillingChecks id={id} canManage={canManage} locked={item.status === 'invoiced'} /></div>
    </>}
  </main>;
}
