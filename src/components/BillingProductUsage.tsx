'use client';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';

type Section = 'consumption' | 'rental' | 'external_rental' | 'external_sale' | 'review';
type Mode = 'sets' | 'loose';
type Product = { id: string; section: Section; category: string; folderPath?: string; name: string; quantity: number; unit: string; unitPrice: number | null; factor?: number; discount?: number; excluded?: boolean; source: 'rentman' | 'manual' };
const sections: { key: Section; label: string; detail: string }[] = [
 { key: 'consumption', label: 'Ingrediënten', detail: 'Cocktails en verbruik' },
 { key: 'rental', label: 'Materiaal & verhuur', detail: 'Geplande verhuurartikelen' },
 { key: 'external_rental', label: 'Externe inhuur', detail: 'Ingehuurd materiaal' },
 { key: 'external_sale', label: 'Externe verkoop', detail: 'Externe verkoopartikelen' },
 { key: 'review', label: 'Overige artikelen', detail: 'Nog te controleren posten' },
];
const money = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
const quantityLabel = (n: number) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 3 }).format(n);
const total = (p: Product) => p.excluded || p.unitPrice === null ? 0 : Math.round(p.quantity * p.unitPrice * (p.section === 'rental' || p.section === 'external_rental' ? (p.factor ?? 1) : 1) * (1 - (p.discount ?? 0) / 100) * 100) / 100;
const border = '1px solid var(--border, #e5e7eb)';
export type BillingProductUsageHandle = { save: () => Promise<void> };
const BillingProductUsage = forwardRef<BillingProductUsageHandle, { id: string; canManage: boolean; locked: boolean }>(function BillingProductUsage({ id, canManage, locked }, ref) {
 const [products, setProducts] = useState<Product[]>([]);
 const [mode, setMode] = useState<Mode>('sets');
 const [openFolders, setOpenFolders] = useState<string[]>([]);
 const [openSections, setOpenSections] = useState<Section[]>(['consumption']);
 const [message, setMessage] = useState('');
 const [warning, setWarning] = useState('');
 const [loading, setLoading] = useState(true);
 const [dirty, setDirty] = useState(false);
 const [saving, setSaving] = useState(false);
 const editable = canManage && !locked;
 useEffect(() => {
  let active = true;
  setLoading(true);
  fetch('/api/planning/billing/products/' + encodeURIComponent(id)).then(async response => {
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Ophalen mislukt');
   return data;
  }).then(data => {
   if (!active) return;
   setProducts(data.products || []);
   setMode(data.mode === 'loose' ? 'loose' : 'sets');
   setWarning(data.warning || '');
   setMessage('');
   setDirty(false);
  }).catch(error => { if (active) setMessage('Ophalen mislukt: ' + error.message); })
   .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [id]);
 const grouped = useMemo(() => sections.map(section => {
  const items = products.filter(p => p.section === section.key && !p.excluded);
  const groups = new Map<string, Product[]>();
  for (const p of items) {
   const folder = p.category?.trim() || 'Zonder map';
   groups.set(folder, [...(groups.get(folder) || []), p]);
  }
  return { ...section, items, groups: [...groups.entries()], total: items.reduce((sum, p) => sum + total(p), 0), missing: items.filter(p => p.unitPrice === null).length };
 }), [products]);
 async function changeMode(next: Mode) {
  if (next === mode || loading) return;
  if (dirty && !window.confirm('Niet-opgeslagen wijzigingen gaan verloren. Doorgaan?')) return;
  setLoading(true);
  setMessage('Berekening ophalen…');
  try {
   const response = await fetch('/api/planning/billing/products/' + encodeURIComponent(id) + '?mode=' + next);
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Ophalen mislukt');
   setProducts(data.products || []);
   setMode(next);
   setDirty(true);
   setOpenFolders([]);
   setWarning(data.warning || '');
   setMessage('Berekeningswijze gewijzigd. Sla de wijzigingen op.');
  } catch (error) { setMessage('Ophalen mislukt: ' + (error instanceof Error ? error.message : 'Onbekende fout')); }
  finally { setLoading(false); }
 }
 function updatePrice(productId: string, value: string) {
  setProducts(current => current.map(p => p.id === productId ? { ...p, unitPrice: value === '' ? null : Math.max(0, Number(value) || 0) } : p));
  setDirty(true);
  setMessage('Niet-opgeslagen wijzigingen');
 }
 function updateQuantity(productId: string, value: string) {
  setProducts(current => current.map(p => p.id === productId ? { ...p, quantity: Math.max(0, Number(value) || 0) } : p));
  setDirty(true);
  setMessage('Niet-opgeslagen wijzigingen');
 }
 function updateFactor(productId: string, value: string) {
  setProducts(current => current.map(p => p.id === productId ? { ...p, factor: value === '' ? 0 : Math.max(0, Number(value) || 0) } : p));
  setDirty(true);
  setMessage('Niet-opgeslagen wijzigingen');
 }
 function remove(productId: string) {
  setProducts(current => current.map(p => p.id === productId ? { ...p, excluded: true } : p));
  setDirty(true);
  setMessage('Niet-opgeslagen wijzigingen');
 }
 async function save() {
  setSaving(true);
  setMessage('Producten opslaan…');
  try {
   const response = await fetch('/api/planning/billing/products/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products, mode }) });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Opslaan mislukt');
   setDirty(false);
   setMessage('Opgeslagen. Rentman is niet gewijzigd.');
  } catch (error) { setMessage('Opslaan mislukt: ' + (error instanceof Error ? error.message : 'Onbekende fout')); }
  finally { setSaving(false); }
 }
 useImperativeHandle(ref, () => ({ save: async () => { if (loading) throw new Error('Producten worden nog geladen'); if (dirty) await save(); } }));
 const toggleFolder = (key: string) => setOpenFolders(current => current.includes(key) ? current.filter(x => x !== key) : [...current, key]);
 const grandTotal = grouped.reduce((sum, section) => sum + section.total, 0);
 return <div style={{display:'grid',gap:12,minWidth:0,maxWidth:'100%'}}>
  <div className="card" style={{padding:'16px 18px'}}>
   <div><div style={{fontSize:12,color:'var(--muted)',marginBottom:4}}>PRODUCTEN & VERBRUIK</div><strong style={{fontSize:20}}>{money(grandTotal)}</strong><div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>{products.filter(p => !p.excluded).length} artikelregels uit de projectafrekening</div></div>
  </div>
  {grouped.filter(section => section.items.length > 0 || loading).map(section => <section key={section.key} className="card" style={{padding:0,minWidth:0}}>
   <button type="button" aria-expanded={openSections.includes(section.key)} onClick={() => setOpenSections(current => current.includes(section.key) ? current.filter(k => k !== section.key) : [...current,section.key])} style={{display:'flex',width:'100%',justifyContent:'space-between',alignItems:'center',gap:12,background:'transparent',padding:'16px 18px',cursor:'pointer',textAlign:'left',border:0}}>
    <span style={{display:'grid',gap:3}}><strong style={{fontSize:15}}>{section.label} <span style={{fontSize:12,color:'var(--muted)',fontWeight:400}}>({section.items.length})</span></strong><span style={{fontSize:12,color:'var(--muted)'}}>{section.detail}</span></span>
    <span style={{display:'flex',alignItems:'center',gap:14,whiteSpace:'nowrap'}}><strong style={{fontSize:15}}>{money(section.total)}</strong><span aria-hidden="true">{openSections.includes(section.key) ? "▴" : "▾"}</span></span>
   </button>
   {openSections.includes(section.key) && <div style={{borderTop:border,padding:'14px 18px'}}>
    {section.key === 'consumption' && <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',paddingBottom:14}}>
     <span style={{fontSize:12,color:'var(--muted)',fontWeight:600}}>Berekeningswijze</span>
     <div style={{display:'flex',border,borderRadius:9,overflow:'hidden'}}>
      {([{value:'sets',label:'Cocktails / sets'},{value:'loose',label:'Losse ingrediënten'}] as {value:Mode;label:string}[]).map(option => <button key={option.value} type="button" disabled={!editable || loading} aria-pressed={mode === option.value} onClick={() => changeMode(option.value)} style={{padding:'8px 12px',border:0,borderRight:option.value === 'sets' ? border : 'none',background:mode === option.value ? 'var(--surface-secondary,#eceff1)' : 'transparent',fontWeight:mode === option.value ? 700 : 400,cursor:editable ? 'pointer' : 'default',fontSize:12}}>{option.label}</button>)}
     </div>
     <span style={{fontSize:12,color:'var(--muted)'}}>{mode === 'sets' ? 'Cocktails als complete set' : 'Ingrediënten afzonderlijk berekend'}</span>
    </div>}
    {warning && <p style={{fontSize:12,color:'var(--muted)',margin:'0 0 12px'}}>{warning}</p>}
    {loading ? <p style={{fontSize:13}}>Producten laden…</p> : section.items.length === 0 ? <p style={{fontSize:13,color:'var(--muted)'}}>Geen artikelen in deze categorie.</p> : <div style={{display:'grid',gap:8}}>
     {section.groups.map(([folder,items]) => {
      const key = section.key + ':' + folder;
      const isOpen = openFolders.includes(key);
      const folderTotal = items.reduce((sum,p) => sum + total(p),0);
      return <div key={key} style={{border,borderRadius:9,overflow:'hidden'}}>
       <button type="button" onClick={() => toggleFolder(key)} aria-expanded={isOpen} style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',padding:'11px 13px',border:0,background:'var(--surface-secondary,#f8f9fa)',cursor:'pointer',textAlign:'left',gap:10}}>
        <span style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}><span aria-hidden="true">{isOpen?'▾':'▸'}</span><strong style={{fontSize:13,overflowWrap:'anywhere'}}>{folder}</strong><span style={{fontSize:12,color:'var(--muted)'}}>({items.length})</span></span>
        <strong style={{fontSize:13,whiteSpace:'nowrap'}}>{money(folderTotal)}</strong>
       </button>
       {isOpen && <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:590,fontSize:12}}>
         <thead><tr style={{color:'var(--muted)',textAlign:'left',borderBottom:border}}>
          <th style={{padding:'10px 12px',fontWeight:500}}>Artikel</th>{(section.key === 'rental' || section.key === 'external_rental') && <th style={{padding:'10px 8px',width:92,fontWeight:500}}>Staffel</th>}<th style={{padding:'10px 8px',width:105,fontWeight:500}}>Aantal</th><th style={{padding:'10px 8px',width:120,fontWeight:500}}>Prijs per stuk</th><th style={{padding:'10px 8px',width:105,textAlign:'right',fontWeight:500}}>Regeltotaal</th><th style={{width:36}}/>
         </tr></thead>
         <tbody>{items.map(p => <tr key={p.id} style={{borderBottom:border}}>
          <td style={{padding:'11px 12px',minWidth:150}}><strong style={{fontWeight:600}}>{p.name}</strong><div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>{p.source === 'rentman' ? 'Rentman' : 'Handmatig'} · {p.unit}</div></td>
          {(section.key === 'rental' || section.key === 'external_rental') && <td style={{padding:'8px'}}><div style={{display:'flex',alignItems:'center',gap:4}}><input className="input" aria-label={'Huurfactor ' + p.name} type="number" min="0" step="any" value={p.factor ?? 1} disabled={!editable} onChange={e => updateFactor(p.id,e.target.value)} style={{width:'100%',minWidth:0,minHeight:34,padding:'5px 7px',fontSize:12}}/><span aria-hidden="true">×</span></div></td>}
          <td style={{padding:'8px'}}><input className="input" aria-label={'Aantal ' + p.name} type="number" min="0" step="any" value={p.quantity} disabled={!editable} onChange={e => updateQuantity(p.id,e.target.value)} style={{width:'100%',minHeight:34,padding:'5px 7px',fontSize:12}}/></td>
          <td style={{padding:'8px'}}><div style={{display:'flex',alignItems:'center',gap:5}}><span aria-hidden="true" style={{fontWeight:600}}>€</span><input className="input" aria-label={'Prijs per stuk ' + p.name} type="number" min="0" step="any" placeholder="€ —" value={p.unitPrice ?? ''} disabled={!editable} onChange={e => updatePrice(p.id,e.target.value)} style={{width:'100%',minWidth:0,minHeight:34,padding:'5px 7px',fontSize:12}}/></div></td>
          <td style={{padding:'8px',textAlign:'right',whiteSpace:'nowrap',fontWeight:600}}>{p.unitPrice === null ? '—' : money(total(p))}</td>
          <td style={{padding:'8px 8px 8px 0'}}><button type="button" aria-label={'Verwijder ' + p.name} title="Verwijderen" disabled={!editable} onClick={() => remove(p.id)} style={{width:30,height:30,border,borderRadius:7,background:'transparent',cursor:editable?'pointer':'default'}}>×</button></td>
         </tr>)}</tbody>
         <tfoot><tr><td colSpan={(section.key === 'rental' || section.key === 'external_rental') ? 4 : 3} style={{padding:'10px 12px',fontWeight:600}}>Subtotaal {folder}</td><td style={{padding:'10px 8px',textAlign:'right',fontWeight:700}}>{money(folderTotal)}</td><td/></tr></tfoot>
        </table>
       </div>}
      </div>;
     })}
    </div>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:12,fontSize:12,color:'var(--muted)'}}>
     <span>{section.missing} prijzen te controleren</span><span>{section.items.length} regels · {money(section.total)}</span>
    </div>
   </div>}
  </section>)}
  <div className="billing-product-actions" style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:12,flexWrap:'wrap',padding:'0 4px 8px'}}>
    {dirty && <span style={{fontSize:12,color:'var(--muted)'}}>Niet opgeslagen</span>}
    {editable && <button type="button" className="button orange" disabled={!dirty || saving || loading} onClick={save}>{saving ? 'Opslaan…' : 'Productwijzigingen opslaan'}</button>}
  </div>
  {message && <div role="status" aria-live="polite" style={{fontSize:12,color:'var(--muted)'}}>{message}</div>}
 </div>;
}
