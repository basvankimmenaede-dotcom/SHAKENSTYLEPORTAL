'use client';
import Link from 'next/link';
import BillingProductUsage from './BillingProductUsage';
import BillingChecks from './BillingChecks';
import BillingHours from './BillingHours';
import BillingTransport from './BillingTransport';
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
  const [activeTab,setActiveTab] = useState('overzicht');
  const [summary,setSummary] = useState({hours:0,functions:0,kilometers:0,vehicles:0,products:0,productTotal:0});
  useEffect(()=>{
    let active=true;
    Promise.allSettled([
      fetch('/api/planning/billing/hours/'+encodeURIComponent(id)).then(r=>r.ok?r.json():Promise.reject()),
      fetch('/api/planning/billing/products/'+encodeURIComponent(id)).then(r=>r.ok?r.json():Promise.reject())
    ]).then(results=>{
      if(!active)return;
      const hours=results[0].status==='fulfilled'?results[0].value:{};
      const products=results[1].status==='fulfilled'?(results[1].value.products||[]):[];
      const rows=hours.rows||[];
      const isVehicle=(r:{type?:string;name:string})=>r.type==='vehicle_function'||/bakwagen|bestelbus|bestelauto|vrachtwagen|transport/i.test(r.name);
      setSummary({
        hours:rows.filter((r:{type?:string;name:string})=>!isVehicle(r)).reduce((s:number,r:{plannedHours?:number})=>s+(r.plannedHours||0),0),
        functions:rows.filter((r:{type?:string;name:string})=>!isVehicle(r)).length,
        kilometers:(hours.vehicleTrips||[]).reduce((s:number,r:{kilometers?:number})=>s+(r.kilometers||0),0),
        vehicles:rows.filter(isVehicle).length,
        products:products.length,
        productTotal:products.reduce((s:number,p:{quantity:number;unitPrice:number|null})=>s+p.quantity*(p.unitPrice||0),0)
      });
    });
    return ()=>{active=false};
  },[id]);
  function navigate(tab:string){setActiveTab(tab);document.getElementById('billing-'+tab)?.scrollIntoView({behavior:'smooth',block:'start'});}

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
  const totals = useMemo(() => draft.lines.filter(l => !l.description.startsWith('[Transport] ')).reduce((a, l) => {
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
  return <main className="container" style={{ maxWidth: 1600, paddingBottom: 60, width: '100%' }}>
    <Link href="/planning/billing">← Terug naar facturatie</Link>
    <h1 style={{ fontSize: 32, margin: '12px 0' }}>Projectafrekening</h1>
    {item && <p><strong>{item.rentman_project_number ? '#' + item.rentman_project_number + ' · ' : ''}{item.project_name}</strong> · {item.status === 'invoiced' ? 'Gefactureerd (vergrendeld)' : 'Concept'}</p>}
    {!item ? <p role="status">{state}</p> : <>
      <nav aria-label="Projectafrekening navigatie" style={{display:'flex',flexWrap:'wrap',width:'fit-content',margin:'20px 0',border:'1px solid var(--border,#ddd)',borderRadius:10,overflow:'hidden'}}>
       {([{id:'overzicht',label:'Overzicht'},{id:'personeel',label:'Personeel'},{id:'transport',label:'Transport'},{id:'materiaal',label:'Materiaal'},{id:'overig',label:'Overig'}]).map(tab=><button key={tab.id} type="button" onClick={()=>navigate(tab.id)} style={{padding:'11px 18px',border:0,borderRight:'1px solid var(--border,#ddd)',background:activeTab===tab.id?'#262626':'transparent',color:activeTab===tab.id?'#fff':'inherit',cursor:'pointer',fontSize:13}}>{tab.label}</button>)}
      </nav>
      <div className="billing-draft-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }}><div style={{ minWidth: 0 }}>
      <div id="billing-overzicht" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:12,marginBottom:16}}>
       {([{label:'Personeel',value:summary.hours.toLocaleString('nl-NL',{maximumFractionDigits:2})+' u',detail:summary.functions+' functies',tab:'personeel'},{label:'Transport',value:summary.kilometers.toLocaleString('nl-NL')+' km',detail:summary.vehicles+' voertuigen',tab:'transport'},{label:'Materiaal',value:money(summary.productTotal),detail:summary.products+' artikelen',tab:'materiaal'},{label:'Factuurregels',value:money(totals.net),detail:'Overige regels excl. btw',tab:'overig'}]).map(card=><button key={card.tab} type="button" className="card" onClick={()=>navigate(card.tab)} style={{padding:16,textAlign:'left',cursor:'pointer',minWidth:0}}><span style={{fontSize:12,color:'var(--muted)',display:'block',marginBottom:10}}>{card.label} ↗</span><strong style={{fontSize:21,display:'block'}}>{card.value}</strong><span style={{fontSize:12,color:'var(--muted)',display:'block',marginTop:5}}>{card.detail}</span></button>)}
      </div>
      <div id="billing-personeel"><BillingHours id={id} /></div>
      <div id="billing-transport"><BillingTransport id={id} lines={draft.lines} canManage={canManage && item.status !== 'invoiced'} onChange={lines => {setDraft(d => ({...d,lines}));setState('Niet-opgeslagen wijzigingen');}} /></div>
      <div id="billing-materiaal"><BillingProductUsage id={id} canManage={canManage} locked={item.status === 'invoiced'} /></div>
      <section id="billing-overig" className="card" style={{ padding: 16, marginBottom: 12 }}>
        <details><summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, padding: "4px 0" }}>Overige factuurregels ({draft.lines.filter(l => l.description.trim() && !l.description.startsWith('[Transport] ')).length})</summary>
        {draft.lines.map((line, i) => line.description.startsWith('[Transport] ') ? null : <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 3fr) 85px 110px 95px auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
          <div className="field"><label>Omschrijving</label><input className="input" aria-label={'Omschrijving regel ' + (i + 1)} value={line.description} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'description', e.target.value)} /></div>
          <div className="field"><label>Aantal</label><input className="input" type="number" min="0" step="0.01" value={line.quantity} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'quantity', e.target.value)} /></div>
          <div className="field"><label>Prijs excl.</label><input className="input" type="number" min="0" step="0.01" value={line.unitPrice} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'unitPrice', e.target.value)} /></div>
          <div className="field"><label>Btw</label><select className="input" value={line.vatRate} disabled={!canManage || item.status === 'invoiced'} onChange={e => changeLine(i, 'vatRate', e.target.value)}><option value={21}>21%</option><option value={9}>9%</option><option value={0}>0%</option></select></div>
          <button type="button" className="button secondary" disabled={!canManage || item.status === 'invoiced' || draft.lines.length === 1} onClick={() => { setDraft(d => ({ ...d, lines: d.lines.filter((_, n) => n !== i) })); setState('Niet-opgeslagen wijzigingen'); }}>×</button>
        </div>)}
        <button type="button" className="button secondary" disabled={!canManage || item.status === 'invoiced'} onClick={() => { setDraft(d => ({ ...d, lines: [...d.lines, blank()] })); setState('Niet-opgeslagen wijzigingen'); }}>+ Factuurregel</button>
        <p style={{ textAlign: 'right' }}>Excl. btw: <strong>{money(totals.net)}</strong></p>
        <p style={{ textAlign: 'right' }}>Btw: <strong>{money(totals.vat)}</strong></p>
        <p style={{ textAlign: 'right', fontSize: 14 }}>Totaal incl. btw: <strong>{money(totals.net + totals.vat)}</strong></p>
        </details>
      </section>
      <section className="card" style={{ padding: 12, marginBottom: 10 }}>
        <details><summary style={{ cursor: "pointer", fontSize: 14 }}>Interne notities</summary><div className="field"><label htmlFor="notes">Interne notities</label><textarea id="notes" className="input" value={draft.notes} disabled={!canManage || item.status === 'invoiced'} onChange={e => change('notes', e.target.value)} /></div></details>
      </section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {canManage && item.status !== 'invoiced' && <button type="button" className="button orange" disabled={saving} onClick={save}>{saving ? 'Opslaan…' : 'Concept opslaan'}</button>}
        <span role="status" aria-live="polite">{state}</span>
      </div>
      </div><aside style={{minWidth:0}}>      <section className="card" style={{ padding: 12, marginBottom: 10 }}>
        <h3 style={{margin:'0 0 14px'}}>Klant</h3><strong>{draft.customer_name || item.customer_name || 'Onbekend'}</strong><p style={{whiteSpace:'pre-line',fontSize:13,color:'var(--muted)'}}>{draft.customer_address}</p><p style={{fontSize:13,color:'var(--muted)'}}>{draft.customer_email}</p>
        <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer" }}>Factuurgegevens bewerken</summary>
        {([['customer_name', 'Klant'], ['customer_email', 'E-mailadres'], ['customer_address', 'Factuuradres'], ['reference', 'Referentie / PO-nummer'], ['description', 'Factuuromschrijving']] as const).map(([key, label]) =>
          <div className="field" key={key}><label htmlFor={key}>{label}</label>
            <input className="input" id={key} value={draft[key]} disabled={!canManage || item.status === 'invoiced'} onChange={e => change(key, e.target.value)} /></div>)}
        </details>
      </section>
      <BillingChecks id={id} canManage={canManage} locked={item.status === 'invoiced'} /></aside></div>
    </>}
  </main>;
}
