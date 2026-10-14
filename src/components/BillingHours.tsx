'use client';
import { useEffect, useState } from 'react';
type HourRow = { id:number; type:string|null; name:string; group:string; startsAt:string|null; endsAt:string|null; amount:number; plannedHours:number|null; plannedTravelOutHours:number; plannedTravelBackHours:number };
type Recorded = { id:string; functionId:number|null; workStartedAt:string; workEndedAt:string; hours:number|null; status:string };
const fmt = (n:number) => n.toLocaleString('nl-NL',{maximumFractionDigits:2}) + ' u';
const clock = (value:string|null) => value ? new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';
export default function BillingHours({id}:{id:string}) {
  const [rows,setRows] = useState<HourRow[]>([]);
  const [recorded,setRecorded] = useState<Recorded[]>([]);
  const [assignedCount,setAssignedCount] = useState(0);
  const [expanded,setExpanded] = useState(false);
  const [status,setStatus] = useState('Laden…');
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/hours/'+encodeURIComponent(id)).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Uren ophalen mislukt');
      return data;
    }).then(data => {if(active){setRows(data.rows || []);setRecorded(data.recorded || []);setAssignedCount(data.assignedCount || 0);setStatus(data.warning || '');}})
      .catch(error => {if(active)setStatus('Uren ophalen mislukt: '+error.message);});
    return () => {active=false;};
  },[id]);
  const personnel = rows.filter(row => row.type !== 'vehicle_function' && !/^(bakwagen|bestelbus|bestelauto|transport bestelbus|transport bakwagen|vrachtwagen|auto\\b)/i.test(row.name));
  const planned = personnel.reduce((sum,row)=>sum+(row.plannedHours || 0),0);
  const travel = personnel.reduce((sum,row)=>sum+row.plannedTravelOutHours+row.plannedTravelBackHours,0);
  const registered = recorded.reduce((sum,row)=>sum+(row.hours || 0),0);
  const mapped = recorded.filter(sheet=>sheet.functionId !== null && personnel.some(row=>row.id===sheet.functionId));
  const unlinked = recorded.filter(sheet=>!personnel.some(row=>row.id===sheet.functionId));
  const groups = Object.entries(personnel.reduce<Record<string,HourRow[]>>((acc,row)=>{(acc[row.group || 'Overig'] ??= []).push(row);return acc;},{}));
  const complete = assignedCount > 0 && recorded.length >= assignedCount && unlinked.length === 0 && recorded.every(sheet=>sheet.hours !== null);
  const columns = 'minmax(150px,2fr) 48px 110px 76px 72px 72px 82px 78px';
  return <section className="card" style={{padding:14,marginBottom:10,minWidth:0}}>
    <button type="button" onClick={()=>setExpanded(value=>!value)} style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,background:'transparent',border:0,padding:4,cursor:'pointer',textAlign:'left'}}>
      <strong>Personeel & uren</strong><span style={{fontSize:13,color:'var(--muted)'}}>{personnel.length} functies · {fmt(planned)} werk · {fmt(travel)} reis {expanded?'▴':'▾'}</span>
    </button>
    {expanded && <div style={{marginTop:12}}>
      {status && <p role="status" style={{fontSize:13,color:'var(--muted)'}}>{status}</p>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginBottom:14}}>
        {([{label:'Gepland werk',value:fmt(planned)},{label:'Geplande reistijd',value:fmt(travel)},{label:'Geregistreerd',value:recorded.length?fmt(registered):'Geen sheets'}]).map(item=><div key={item.label} style={{padding:10,border:'1px solid var(--border,#ddd)',borderRadius:8,minWidth:0}}><div style={{fontSize:11,color:'var(--muted)'}}>{item.label}</div><strong style={{fontSize:15}}>{item.value}</strong></div>)}
      </div>
      <p style={{fontSize:12,color:'var(--muted)',margin:'0 0 12px'}}>{recorded.length} van {assignedCount} gekoppelde diensten met een sheet{complete ? ' · Verschil werk: '+fmt(registered-planned) : ' · Verschil pas definitief na alle sheets'}.</p>
      {groups.map(([group,items])=><div key={group} style={{marginTop:14}}>
        <strong style={{display:'block',marginBottom:8,fontSize:13}}>{group}</strong>
        <div style={{overflowX:'auto',maxWidth:'100%'}}>
          <div style={{minWidth:760}}>
            <div style={{display:'grid',gridTemplateColumns:columns,gap:8,padding:'8px 4px',fontSize:11,color:'var(--muted)',borderBottom:'1px solid var(--border,#ddd)'}}>
              <span>Functie</span><span>Aantal</span><span>Tijd</span><span>Werk plan</span><span>Reis heen</span><span>Reis terug</span><span>Werk echt</span><span>Verschil</span>
            </div>
            {items.map(row=>{
              const sheets=mapped.filter(sheet=>sheet.functionId===row.id);
              const worked=sheets.reduce((sum,sheet)=>sum+(sheet.hours || 0),0);
              const isComplete=sheets.length>=row.amount && sheets.every(sheet=>sheet.hours !== null);
              const difference=isComplete && row.plannedHours !== null ? worked-row.plannedHours : null;
              return <div key={row.id} style={{borderBottom:'1px solid var(--border,#ddd)'}}>
                <div style={{display:'grid',gridTemplateColumns:columns,gap:8,padding:'10px 4px',fontSize:12,alignItems:'center'}}>
                  <span style={{fontWeight:600}}>{row.name}</span><span>{row.amount}×</span><span>{clock(row.startsAt)}–{clock(row.endsAt)}</span>
                  <strong>{row.plannedHours===null?'—':fmt(row.plannedHours)}</strong>
                  <span>{fmt(row.plannedTravelOutHours)}</span><span>{fmt(row.plannedTravelBackHours)}</span>
                  <span>{sheets.length?fmt(worked):'—'}</span>
                  <strong>{difference===null?'—':(difference>0?'+':'')+fmt(difference)}</strong>
                </div>
                {sheets.length>0 && <details style={{fontSize:12,padding:'0 4px 8px'}}><summary style={{cursor:'pointer',color:'var(--muted)'}}>{sheets.length} {sheets.length===1?'sheet':'sheets'} bekijken{!isComplete?' · onvolledig':''}</summary>
                  {sheets.map(sheet=><div key={sheet.id} style={{display:'flex',justifyContent:'space-between',padding:'5px 8px'}}><span>{clock(sheet.workStartedAt)}–{clock(sheet.workEndedAt)}</span><strong>{sheet.hours===null?'—':fmt(sheet.hours)}</strong></div>)}
                </details>}
              </div>;
            })}
          </div>
        </div>
      </div>)}
      {!personnel.length && !status && <p style={{fontSize:13,color:'var(--muted)'}}>Geen personeelsfuncties gepland in Rentman.</p>}
      {unlinked.length>0 && <p style={{fontSize:12,color:'var(--muted)'}}>{unlinked.length} sheets niet aan een personeelsfunctie gekoppeld; deze tellen wel mee in geregistreerde uren.</p>}
    </div>}
  </section>;
}
