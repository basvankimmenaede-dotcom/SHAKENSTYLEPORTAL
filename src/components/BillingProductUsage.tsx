'use client';
import { useEffect, useMemo, useState } from 'react';
type Section = 'consumption' | 'rental' | 'external_rental' | 'external_sale' | 'review';
type Product = {id:string;section:Section;category:string;folderPath?:string;name:string;quantity:number;unit:string;unitPrice:number|null;source:'rentman'|'manual'};
const sections: {key:Section;label:string}[] = [{key:'consumption',label:'Ingrediënten'},{key:'rental',label:'Materiaal & verhuur'},{key:'external_rental',label:'Externe inhuur'},{key:'external_sale',label:'Externe verkoop'},{key:'review',label:'Overige artikelen'}];
const money=(n:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n);
export default function BillingProductUsage({id,canManage,locked}:{id:string;canManage:boolean;locked:boolean}) {
 const [products,setProducts]=useState<Product[]>([]);
 const [expanded,setExpanded]=useState<Section|null>(null);
 const [openFolders,setOpenFolders]=useState<string[]>([]);
 const [message,setMessage]=useState('Producten laden…');
 const [warning,setWarning]=useState('');
 const [loading,setLoading]=useState(true);
 const [dirty,setDirty]=useState(false);
 const [saving,setSaving]=useState(false);
 const editable=canManage&&!locked;
 useEffect(()=>{let active=true;fetch('/api/planning/billing/products/'+encodeURIComponent(id)).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Ophalen mislukt');return data;}).then(data=>{if(!active)return;setProducts(data.products||[]);setWarning(data.warning||'');setLoading(false);setMessage('');}).catch(e=>{if(active){setMessage('Fout: '+e.message);setLoading(false);}});return()=>{active=false;};},[id]);
 const grouped=useMemo(()=>sections.map(section=>{const items=products.filter(p=>p.section===section.key);const groups=new Map<string,Product[]>();for(const p of items){const folder=p.category||'Overig';groups.set(folder,[...(groups.get(folder)||[]),p]);}return {...section,items,groups:[...groups.entries()],total:items.reduce((sum,p)=>sum+p.quantity*(p.unitPrice||0),0)};}),[products]);
 function updatePrice(productId:string,value:string){setProducts(current=>current.map(p=>p.id===productId?{...p,unitPrice:value===''?null:Math.max(0,Number(value)||0)}:p));setDirty(true);setMessage('Niet-opgeslagen wijzigingen');}
 function remove(productId:string){setProducts(current=>current.filter(p=>p.id!==productId));setDirty(true);setMessage('Niet-opgeslagen wijzigingen');}
 async function save(){setSaving(true);setMessage('Producten opslaan…');try{const response=await fetch('/api/planning/billing/products/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({products})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Opslaan mislukt');setDirty(false);setMessage('Producten opgeslagen (Rentman ongewijzigd)');}catch(e){setMessage('Opslaan mislukt: '+(e instanceof Error?e.message:'Onbekende fout'));}finally{setSaving(false);}}
 const toggleFolder=(key:string)=>setOpenFolders(old=>old.includes(key)?old.filter(x=>x!==key):[...old,key]);
 return <div>{grouped.map(section=><section key={section.key} className="card" style={{padding:14,marginBottom:10,minWidth:0}}>
 <button type="button" onClick={()=>setExpanded(old=>old===section.key?null:section.key)} style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',width:'100%',border:0,background:'transparent',padding:4,cursor:'pointer',textAlign:'left'}}>
 <strong>{section.label} ({section.items.length})</strong><span>{money(section.total)} {expanded===section.key?'▴':'▾'}</span></button>
 {expanded===section.key&&<div style={{marginTop:12}}>
 {warning&&<p style={{fontSize:12,color:'var(--muted)'}}>{warning}</p>}
 {loading?<p>Laden…</p>:section.items.length===0?<p style={{fontSize:13,color:'var(--muted)'}}>Geen artikelen.</p>:section.groups.map(([folder,items])=>{
 const folderKey=section.key+':'+folder;
 const isOpen=openFolders.includes(folderKey);
 return <div key={folderKey} style={{borderTop:'1px solid var(--border,#ddd)'}}>
 <button type="button" onClick={()=>toggleFolder(folderKey)} style={{display:'flex',width:'100%',justifyContent:'space-between',alignItems:'center',gap:10,border:0,background:'var(--surface-secondary,#fafafa)',padding:'10px 12px',cursor:'pointer',textAlign:'left'}}>
 <strong style={{fontSize:13}}>▱ {folder} ({items.length})</strong><span style={{fontSize:13}}>{money(items.reduce((sum,p)=>sum+p.quantity*(p.unitPrice||0),0))} {isOpen?'▴':'▾'}</span></button>
 {isOpen&&<div style={{padding:'0 8px'}}>
 <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 110px 34px',gap:8,padding:'9px 0',fontSize:11,color:'var(--muted)'}}><span>Artikel</span><span>Prijsvoorstel</span><span/></div>
 {items.map(p=><div key={p.id} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 110px 34px',gap:8,alignItems:'center',padding:'8px 0',borderTop:'1px solid var(--border,#eee)'}}>
 <div style={{minWidth:0}}><strong style={{fontSize:13,overflowWrap:'anywhere'}}>{p.name}</strong><div style={{fontSize:11,color:'var(--muted)'}}>{p.quantity.toLocaleString('nl-NL')} {p.unit}</div></div>
 <input aria-label={'Prijsvoorstel '+p.name} className="input" type="number" min="0" step="0.01" placeholder="€ —" value={p.unitPrice??''} disabled={!editable} onChange={e=>updatePrice(p.id,e.target.value)} style={{width:'100%',height:34,minHeight:34,padding:'4px 7px',fontSize:12}}/>
 <button type="button" aria-label={'Verwijder '+p.name} title="Verwijderen" disabled={!editable} onClick={()=>remove(p.id)} style={{width:32,height:32,border:'1px solid var(--border,#ddd)',borderRadius:7,background:'transparent',cursor:editable?'pointer':'default',color:'var(--muted)'}}>×</button>
 </div>)}</div>}</div>;})}
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:12}}>
 <span style={{fontSize:12,color:'var(--muted)'}}>{section.items.filter(p=>p.unitPrice===null).length} prijzen te controleren</span>
 {editable&&<button type="button" className="button orange" disabled={!dirty||saving||loading} onClick={save}>{saving?'Opslaan…':'Producten opslaan'}</button>}</div>
 <span role="status" aria-live="polite" style={{fontSize:12}}>{message}</span>
 </div>}</section>)}</div>;
}
