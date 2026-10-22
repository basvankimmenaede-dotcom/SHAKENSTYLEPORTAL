'use client';
import { useEffect, useState } from 'react';
type HourRow = { id:number; type:string|null; name:string; group:string; startsAt:string|null; endsAt:string|null; amount:number; plannedHours:number|null; plannedTravelOutHours:number; plannedTravelBackHours:number; priceRateRef?:string|null; priceTravel?:number|null; priceOther?:number|null; priceRate?:{name:string}|null };
type Recorded = { id:string; functionId:number|null; workStartedAt:string; workEndedAt:string; hours:number|null; status:string; crewMemberName:string; travelMinutes:number|null };
const fmt = (n:number) => n.toLocaleString('nl-NL',{maximumFractionDigits:2}) + ' u';
const clock = (value:string|null) => value ? new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';
type InvoiceLine = {description:string;quantity:number;unitPrice:number;vatRate:number};
const euro=(value:number)=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value);
const hourly=(name:string|undefined):number|null=>{const match=name?.match(/€\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*u/i);return match?Number(match[1].replace(',','.')):null;};
export default function BillingHours({id,lines,canManage,onChange}:{id:string;lines:InvoiceLine[];canManage:boolean;onChange:(lines:InvoiceLine[])=>void}) {
  const [rows,setRows] = useState<HourRow[]>([]);
  const [recorded,setRecorded] = useState<Recorded[]>([]);
  const [assignedCount,setAssignedCount] = useState(0);
  const [expanded,setExpanded] = useState(true);
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
  const personnel = rows.filter(row => row.type !== 'vehicle_function' && row.type !== 'transport_function' && !/^(bakwagen|bestelbus|bestelauto|transport bestelbus|transport bakwagen|vrachtwagen|auto\\b)/i.test(row.name));
  const planned = personnel.reduce((sum,row)=>sum+(row.plannedHours || 0),0);
  const travel = personnel.reduce((sum,row)=>sum+row.plannedTravelOutHours+row.plannedTravelBackHours,0);
  const registered = recorded.reduce((sum,row)=>sum+(row.hours || 0),0);
  const registeredTravel = recorded.reduce((sum,row)=>sum+Math.max(0,Number(row.travelMinutes)||0),0)/60;
  const mapped = recorded.filter(sheet=>sheet.functionId !== null && personnel.some(row=>row.id===sheet.functionId));
  const unlinked = recorded.filter(sheet=>!personnel.some(row=>row.id===sheet.functionId));
  const groups: [string,HourRow[]][] = [['Alle functies',personnel]];
  const complete = assignedCount > 0 && recorded.length >= assignedCount && unlinked.length === 0 && recorded.every(sheet=>sheet.hours !== null);
  const columns = 'minmax(110px,1.5fr) 40px 85px 70px 70px 70px 65px 85px 90px';
  const rateKey=(id:number)=>'Rentman personeel #'+id;
  const getRate=(row:HourRow)=>lines.find(line=>line.description===rateKey(row.id))?.unitPrice ?? hourly(row.priceRate?.name);
  const travelKey=(id:number)=>'Rentman personeel reis #'+id;
  const workLine=(row:HourRow)=>lines.find(line=>line.description===rateKey(row.id));
  const travelLine=(row:HourRow)=>lines.find(line=>line.description===travelKey(row.id));
  const workHours=(row:HourRow)=>workLine(row)?.quantity ?? row.plannedHours ?? 0;
  const travelHours=(row:HourRow)=>travelLine(row)?.quantity ?? (row.plannedTravelOutHours+row.plannedTravelBackHours);
  const edit=(row:HourRow,part:'work'|'travel'|'rate',value:number)=>{
    const rate=getRate(row)??0;
    const work=part==='work'?value:workHours(row);
    const travel=part==='travel'?value:travelHours(row);
    const nextRate=part==='rate'?value:rate;
    onChange([...lines.filter(line=>line.description!==rateKey(row.id)&&line.description!==travelKey(row.id)),
      {description:rateKey(row.id),quantity:work,unitPrice:nextRate,vatRate:21},
      {description:travelKey(row.id),quantity:travel,unitPrice:nextRate,vatRate:21}]);
  };
  return <section className="card" style={{padding:20,marginBottom:14,minWidth:0}}>
    <button type="button" onClick={()=>setExpanded(value=>!value)} style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,background:'transparent',border:0,padding:4,cursor:'pointer',textAlign:'left'}}>
      <strong style={{fontSize:17}}>Personeel & uren</strong><span style={{fontSize:13,color:'var(--muted)'}}>{personnel.length} functies · {fmt(planned)} werk · {fmt(travel)} reis {expanded?'▴':'▾'}</span>
    </button>
    {expanded && <div style={{marginTop:12}}>
      {status && <p role="status" style={{fontSize:13,color:'var(--muted)'}}>{status}</p>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginBottom:14}}>
        {([{label:'Gepland werk',value:fmt(planned)},{label:'Geplande reistijd',value:fmt(travel)},{label:'Geregistreerd werk',value:recorded.length?fmt(registered):'Geen sheets'},{label:'Geregistreerde reistijd',value:recorded.length?fmt(registeredTravel):'Geen sheets'}]).map(item=><div key={item.label} style={{padding:10,border:'1px solid var(--border,#ddd)',borderRadius:8,minWidth:0}}><div style={{fontSize:11,color:'var(--muted)'}}>{item.label}</div><strong style={{fontSize:15}}>{item.value}</strong></div>)}
      </div>
      <p style={{fontSize:12,color:'var(--muted)',margin:'0 0 12px'}}>{recorded.length} van {assignedCount} gekoppelde diensten met een sheet{complete ? ' · Verschil werk: '+fmt(registered-planned) : ' · Verschil pas definitief na alle sheets'}.</p>
      {groups.map(([group,items])=><div key={group} style={{marginTop:14}}>
        <strong style={{display:'block',marginBottom:8,fontSize:13}}>{group}</strong>
        <div style={{overflowX:'auto',maxWidth:'100%'}}>
          <div style={{minWidth:0}}>
            <div style={{display:'grid',gridTemplateColumns:columns,gap:5,padding:'8px 2px',fontSize:11,color:'var(--muted)',borderBottom:'1px solid var(--border,#ddd)'}}>
              <span>Functie</span><span>Aantal</span><span>Tijd</span><span>Werkuren</span><span>Reisuren</span><span>Gereg. werk</span><span>Verschil</span><span>€ / uur</span><span>Totaal</span>
            </div>
            {items.map(row=>{
              const sheets=mapped.filter(sheet=>sheet.functionId===row.id);
              const worked=sheets.reduce((sum,sheet)=>sum+(sheet.hours || 0),0);
              const travelled=sheets.reduce((sum,sheet)=>sum+Math.max(0,Number(sheet.travelMinutes)||0),0);
              const isComplete=sheets.length>=row.amount && sheets.every(sheet=>sheet.hours !== null);
              const plannedForSubmitted = row.plannedHours === null ? null : row.plannedHours / Math.max(1,row.amount) * sheets.filter(sheet=>sheet.hours !== null).length;
              const difference = plannedForSubmitted === null || !sheets.some(sheet=>sheet.hours !== null) ? null : Math.round((worked-plannedForSubmitted)*100)/100;
              return <div key={row.id} style={{borderBottom:'1px solid var(--border,#ddd)'}}>
                <div style={{display:'grid',gridTemplateColumns:columns,gap:5,padding:'10px 2px',fontSize:12,alignItems:'center'}}>
                  <span style={{fontWeight:600}} title={row.priceRateRef ? 'Rentman tarief: '+row.priceRateRef : 'Geen Rentman-tarief gekoppeld'}>{row.name}{!row.priceRateRef && <span style={{color:'var(--muted)',fontWeight:400}}> · tarief ontbreekt</span>}</span><span>{row.amount}×</span><span>{clock(row.startsAt)}–{clock(row.endsAt)}</span>
                  <input className="input" aria-label={'Werkuren '+row.name} type="number" min="0" step="any" disabled={!canManage} value={workHours(row)} onChange={event=>edit(row,'work',Math.max(0,Number(event.target.value)||0))} style={{width:'100%',minWidth:0,padding:4,fontSize:11}}/>
                  <input className="input" aria-label={'Reisuren '+row.name} title={'Heen: '+fmt(row.plannedTravelOutHours)+' · Terug: '+fmt(row.plannedTravelBackHours)} type="number" min="0" step="any" disabled={!canManage} value={travelHours(row)} onChange={event=>edit(row,'travel',Math.max(0,Number(event.target.value)||0))} style={{width:'100%',minWidth:0,padding:4,fontSize:11}}/>
                  <span>{sheets.length?fmt(worked):'—'}</span>
                  <strong title={isComplete?'Verschil met volledige planning':'Voorlopig verschil voor ingediende sheets'}>{difference===null?'—':(difference>0?'+':'')+fmt(difference)+(isComplete?'':' *')}</strong>
                  <input className="input" aria-label={'Uurtarief '+row.name} type="number" min="0" step="0.01" disabled={!canManage} value={getRate(row)??''} placeholder="Tarief ontbreekt" onChange={event=>edit(row,'rate',Math.max(0,Number(event.target.value)||0))} style={{width:'100%',minWidth:0,padding:5}}/>
                  <strong title={'Werk: '+euro(workHours(row)*(getRate(row)??0))+' · Reis: '+euro(travelHours(row)*(getRate(row)??0))}>{getRate(row)===null?'—':euro((workHours(row)+travelHours(row))*getRate(row)!)}</strong>
                </div>
                {sheets.length>0 && <details style={{fontSize:12,padding:'0 4px 8px'}}><summary style={{cursor:'pointer',color:'var(--muted)'}}>{sheets.length} {sheets.length===1?'registratie':'registraties'} bekijken · {travelled} min reis{!isComplete?' · verschil voorlopig':''}</summary>
                  {sheets.map(sheet=><div key={sheet.id} style={{display:'flex',justifyContent:'space-between',padding:'5px 8px'}}><span><strong>{sheet.crewMemberName || 'Onbekende medewerker'}</strong> · {clock(sheet.workStartedAt)}–{clock(sheet.workEndedAt)}</span><span style={{textAlign:'right'}}><strong>Werk: {sheet.hours===null?'—':fmt(sheet.hours)}</strong><br/>Reis: {Math.max(0,Number(sheet.travelMinutes)||0)} min</span></div>)}
                </details>}
              </div>;
            })}
          </div>
        </div>
      </div>)}
      <p style={{fontSize:11,color:'var(--muted)',marginTop:10}}>* Voorlopig verschil: alleen ingediende registraties vergeleken met de geplande uren voor die medewerkers.</p>
      {!personnel.length && !status && <p style={{fontSize:13,color:'var(--muted)'}}>Geen personeelsfuncties gepland in Rentman.</p>}
      {unlinked.length>0 && <div style={{fontSize:12,color:'var(--muted)'}}><p>{unlinked.length} niet-gekoppelde registraties:</p>{unlinked.map(sheet=><p key={sheet.id}>{sheet.crewMemberName} · werk {sheet.hours===null?'—':fmt(sheet.hours)} · reis {Math.max(0,Number(sheet.travelMinutes)||0)} min</p>)}</div>}
      {false && unlinked.length>0 && <p style={{fontSize:12,color:'var(--muted)'}}>{unlinked.length} sheets niet aan een personeelsfunctie gekoppeld; deze tellen wel mee in geregistreerde uren.</p>}
    </div>}
  </section>;
}
