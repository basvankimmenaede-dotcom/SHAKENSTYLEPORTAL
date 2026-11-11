'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2,Clock3,MailCheck,AlertTriangle,ChevronDown} from 'lucide-react';
import InvoiceShiftComparison from '@/components/InvoiceShiftComparison';
import type {InvoiceCheck} from '@/lib/invoice-shift-comparison';
import {canDeclineInvoice} from '@/lib/invoice-decision';
import {INVOICE_COST_CATEGORY_LABELS,type InvoiceCostCategory} from '@/lib/invoice-suppliers';

type Invoice={
 id:string;extraction_id:string|null;supplier_id:string|null;cost_category:string|null;invoice_number:string;name:string;total_amount:number|null;status:string;
 correction_reason:string|null;created_at:string;approved_first_by:string|null;approved_second_by:string|null;
 project_numbers:string[];project_lines:{project_number:string;work_hours:number|null;travel_hours:number|null;expenses_amount:number|null}[];
 approval_policy_one:string|null;approval_policy_two:string|null;forward_to:string|null;
 forwarded_at:string|null;forward_attempted_at:string|null;forward_error:string|null;
};
type Approver={id:string;full_name:string};
export default function CrewInvoiceAdminList({invoices,canManage,currentUserId,approvers,configuredOne,configuredTwo,configuredForwardTo,comparisons}:{
 invoices:Invoice[];canManage:boolean;currentUserId:string;approvers:Approver[];
 configuredOne:string;configuredTwo:string;configuredForwardTo:string;comparisons:Record<string,InvoiceCheck>;
}){
 const [expanded,setExpanded]=useState<string|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [decision,setDecision]=useState<'reject'|'correct'>('correct');
 const [reason,setReason]=useState('');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState<string|null>(null);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  if(!notice)return;
  const timer=window.setTimeout(()=>setNotice(''),5000);
  return ()=>window.clearTimeout(timer);
 },[notice]);
 const [preview,setPreview]=useState<{id:string;number:string}|null>(null);
 const [editId,setEditId]=useState<string|null>(null);
 const [editProjects,setEditProjects]=useState('');
 const [editLines,setEditLines]=useState<Record<string,{work_hours:string;travel_hours:string;expenses_amount:string}>>({});
 const editNumbers=[...new Set(editProjects.split(/[\s;,]+/).map(s=>s.trim()).filter(Boolean))].slice(0,15);
 const editValid=editNumbers.every(n=>/^\d{4,8}$/.test(n));
 const setLine=(number:string,key:'work_hours'|'travel_hours'|'expenses_amount',value:string)=>{
   setEditLines(previous=>({...previous,[number]:{...(previous[number]||{work_hours:'',travel_hours:'',expenses_amount:''}),[key]:value}}));
 };
 const startEdit=(inv:Invoice)=>{
  setEditId(inv.id);setEditProjects((inv.project_numbers||[]).join(', '));
  setEditLines(Object.fromEntries((inv.project_lines||[]).map(line=>[line.project_number,{
   work_hours:line.work_hours===null?'':String(line.work_hours),
   travel_hours:line.travel_hours===null?'':String(line.travel_hours),
   expenses_amount:line.expenses_amount===null?'':String(line.expenses_amount)
  }])));
 };
 const router=useRouter();
 const toggleInvoice=(id:string)=>{
  setExpanded(current=>current===id?null:id);
  setSelected(null);setEditId(null);setReason('');
 };
 const labels:Record<string,string>={
  received:'Ontvangen',in_review:'In behandeling',correction_sending:'Correctiemail controleren',
  correction_needed:'Correctie nodig',rejected:'Afgekeurd',approved:'Goedgekeurd'
 };
 const names=new Map(approvers.map(a=>[a.id,a.full_name]));
 const ready=Boolean(configuredOne&&configuredTwo&&configuredOne!==configuredTwo&&configuredForwardTo);
 async function post(id:string,url:string,payload:Record<string,unknown>={}){
  if(!canManage||saving)return;
  setSaving(id);setError('');setNotice('');
  try{
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)});
   const contentType=response.headers.get('content-type')||'';
   const result=contentType.includes('application/json')?await response.json():{error:'Er is een serverfout opgetreden. Vernieuw het overzicht.'};
   if(!response.ok)throw Error(result.error||'Verzenden mislukt.');
   setSelected(null);setReason('');setDecision('correct');
   if(!url.endsWith('/project-review'))setExpanded(null);
   setNotice(result.message||'Verwerkt.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Actie mislukt.');}
  finally{setSaving(null);}
 }
 if(invoices.length===0)return <p className="invoiceQueueEmpty">Geen openstaande facturen</p>;
 return <div className="stack">
  {(error||notice)&&<p className={'invoiceProcessMessage '+(error?'error':'success')} role={error?'alert':'status'}>{error||notice}</p>}
  {!ready&&<div className="notice">Stel eerst twee goedkeurders en het boekhoudadres in bij <Link href="/planning/instellingen/factuurverwerking">Factuurverwerking</Link>.</div>}
  {invoices.map(inv=>{
   const first=inv.approved_first_by,second=inv.approved_second_by;
   const approverIds=[inv.approval_policy_one||configuredOne,inv.approval_policy_two||configuredTwo];
   const allowed=canManage&&ready&&approverIds.includes(currentUserId)&&currentUserId!==first&&!second&&!inv.forward_attempted_at
     &&['received','in_review'].includes(inv.status);
   const canDecline=canDeclineInvoice(inv,currentUserId,canManage,configuredOne,configuredTwo);
   const forwarding=Boolean(second&&!inv.forwarded_at);
   const approved=inv.status==='approved'&&Boolean(inv.forwarded_at);
   const supplierInvoice=Boolean(inv.supplier_id);
   const review=comparisons[inv.id]||{status:'unverified' as const,projects:[]};
   const canEdit=canManage&&['received','in_review'].includes(inv.status)&&!first&&!second&&!inv.forward_attempted_at;
   const needsAttention=!supplierInvoice&&['difference','missing_report'].includes(review.status);
   const comparisonLabel=supplierInvoice?'Leverancier':review.status==='difference'?'Afwijking':review.status==='missing_report'?'Rapport ontbreekt':review.status==='match'?'Uren kloppen':'Controle nodig';
   const expandedNow=expanded===inv.id;
   return <section key={inv.id} className="card invoiceApprovalCard invoiceApprovalCompact">
    <button className="invoiceCompactToggle" type="button" aria-expanded={expandedNow}
     aria-controls={expandedNow?'invoice-details-'+inv.id:undefined} onClick={()=>toggleInvoice(inv.id)}>
     <span className="invoiceCompactIdentity"><strong>{inv.name}</strong>
      <span>{inv.invoice_number} · {(inv.project_numbers||[]).length?(inv.project_numbers||[]).map(n=>'#'+n).join(' · '):'Geen projectnummer'}</span>
     </span>
     <span className="invoiceCompactAmount">{inv.total_amount===null?'Bedrag onbekend':Number(inv.total_amount).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})}</span>
     <span className="invoiceCompactFlags">
      <span className={'invoiceCompactComparison '+(needsAttention?'attention':review.status==='match'?'match':'')}>{comparisonLabel}</span>
      <span className="invoiceCompactProgress">{second?'2/2 akkoord':first?'1/2 akkoord':'0/2 akkoord'}</span>
      {(forwarding||inv.status==='correction_sending'||inv.status==='correction_needed')&&
       <span className="invoiceCompactState">{forwarding?'Verzending controleren':labels[inv.status]}</span>}
     </span>
     <ChevronDown className={'invoiceCompactChevron '+(expandedNow?'open':'')} size={18}/>
    </button>
    {expandedNow&&<div id={'invoice-details-'+inv.id} className="invoiceCompactDetails">
    {inv.correction_reason&&<p className="muted">Correctiereden: {inv.correction_reason}</p>}
    {supplierInvoice?<div className="invoiceSupplierReview">
      <strong>Leveranciersfactuur</strong>
      <p><span>Kostensoort: </span><strong>{INVOICE_COST_CATEGORY_LABELS[inv.cost_category as InvoiceCostCategory]||'Overig'}</strong></p>
      <p><span>Project: </span>{(inv.project_numbers||[]).length?(inv.project_numbers||[]).map(n=>'#'+n).join(' · '):'Geen project gekoppeld · algemene bedrijfskosten'}</p>
      <small>Controleer het bedrag, de factuurregels en eventueel de bestelling met de originele PDF. Voor leveranciers is geen shiftrapport vereist.</small>
     </div>:<InvoiceShiftComparison comparison={review}/>}
    {canEdit&&(editId===inv.id?<div className="invoiceProjectEditor">
      <strong>Projectgegevens controleren</strong>
      <label><span>Projectnummer(s)</span><input className="input" value={editProjects}
       onChange={e=>setEditProjects(e.target.value)} placeholder="Bijv. 11057, 11059"/></label>
      <p>{supplierInvoice?'Een leveranciersfactuur mag ook zonder projectnummer worden opgeslagen.':'Controleer de uren per project tegen de originele PDF. Laat onbekende gegevens leeg.'}</p>
      {!supplierInvoice&&editValid&&editNumbers.map(n=><div className="invoiceProjectHoursRow" key={n}>
       <strong>#{n}</strong>
       {([['work_hours','Factuururen'],['travel_hours','Reisuren'],['expenses_amount','Onkosten (€)']] as const)
        .map(([key,label])=><label key={key}><span>{label}</span>
         <input className="input" type="number" step="0.01" min="0" value={editLines[n]?.[key]||''}
          onChange={e=>setLine(n,key,e.target.value)} placeholder="Niet vermeld"/></label>)}
      </div>)}
      {!editValid?<p className="error">Controleer de projectnummers.</p>:null}
      <div className="invoiceProjectEditorActions"><button className="button orange" type="button" disabled={!editValid||Boolean(saving)}
       onClick={()=>post(inv.id,'/api/crew/admin/invoices/'+inv.id+'/project-review',{projectNumbers:editNumbers,
        projectLines:editNumbers.map(project_number=>({
         project_number,work_hours:editLines[project_number]?.work_hours||null,
         travel_hours:editLines[project_number]?.travel_hours||null,
         expenses_amount:editLines[project_number]?.expenses_amount||null
        }))})}>Projectgegevens opslaan</button>
       <button className="button secondary" type="button" onClick={()=>setEditId(null)}>Annuleren</button></div>
     </div>:<div className="invoiceProjectEditTrigger">
      <button className="button secondary" type="button" onClick={()=>startEdit(inv)}>Projectnummer / uren aanpassen</button>
     </div>)}
    <div className="invoiceApprovalSteps">
     {approverIds.filter(Boolean).map((id,i)=>{
      const completed=first===id||second===id;
      return <div className={'invoiceApprovalStep '+(completed?'complete':'')} key={i}>
       {completed?<CheckCircle2 size={17}/>:<Clock3 size={17}/>}
       <div><strong>{i+1}e goedkeurder</strong><span>{names.get(id)||'Account onbekend'} — {completed?'Goedgekeurd':'Wacht op akkoord'}</span></div>
      </div>;
     })}
    </div>
    {forwarding&&<div className="invoiceApprovalWarning"><AlertTriangle size={17}/><span>{inv.forward_error||'Beide akkoorden zijn vastgelegd, maar doorsturen is nog niet bevestigd. Controleer de boekhoudmailbox.'}</span></div>}
    {approved&&<p className="invoiceApprovalForward"><MailCheck size={16}/> PDF doorgestuurd naar {inv.forward_to}.</p>}
    <div className="invoiceApprovalActions">
     {inv.extraction_id&&<button className="button secondary" type="button" onClick={()=>setPreview({id:inv.extraction_id!,number:inv.invoice_number})}>PDF bekijken</button>}
     {allowed&&<button className="button orange" type="button" disabled={Boolean(saving)}
      onClick={()=>{
       if(['difference','missing_report'].includes(review.status)&&
         !window.confirm('Er is een afwijking of een ontbrekend shiftrapport. Wil je deze factuur toch goedkeuren?'))return;
       void post(inv.id,'/api/crew/admin/invoices/'+inv.id+'/approve');
      }}>
      {saving===inv.id?'Verwerken…':first?'Tweede akkoord & doorsturen':'Factuur goedkeuren (1/2)'}
     </button>}
     {canDecline&&(selected===inv.id?<div className="invoiceApprovalCorrection">
       <strong>{decision==='reject'?'Factuur afkeuren':'Correctie aanvragen bij de bartender'}</strong>
       <label htmlFor={'reason-'+inv.id}>{decision==='reject'?'Waarom keur je deze factuur af?':'Wat moet de bartender aanpassen?'}</label>
       <textarea id={'reason-'+inv.id} className="input" rows={3} maxLength={1500} value={reason}
        onChange={e=>setReason(e.target.value)} placeholder="Bijvoorbeeld: op de factuur staat 5,5 uur, het shiftrapport vermeldt 5,75 uur."/>
       <p className="muted">{decision==='reject'
        ?'Afkeuren verplaatst de factuur naar het archief. Er gaat geen e-mail uit; het eerste akkoord vervalt.'
        :'De bartender ontvangt een correctiemail. Het eerste akkoord vervalt; de nieuwe PDF moet opnieuw worden gecontroleerd.'}</p>
       <div><button className={decision==='reject'?'button secondary':'button orange'} type="button"
        disabled={Boolean(saving)||reason.trim().length<8}
        onClick={()=>{
         if(decision==='reject'&&!window.confirm('Factuur afkeuren en niet doorsturen naar de boekhouding?'))return;
         void post(inv.id,'/api/crew/admin/invoices/'+inv.id+(decision==='reject'?'/reject':'/request-correction'),{reason:reason.trim()});
        }}>{saving===inv.id?'Verwerken…':decision==='reject'?'Afkeuring bevestigen':'Correctiemail versturen'}</button>
       <button className="button secondary" type="button" disabled={Boolean(saving)}
        onClick={()=>{setSelected(null);setReason('');setError('')}}>Annuleren</button></div>
      </div>:<div className="invoiceDeclineActions">
       <button className="button secondary" type="button" disabled={Boolean(saving)}
        onClick={()=>{setSelected(inv.id);setDecision('reject');setReason('');setError('')}}>Afkeuren</button>
       <button className="button secondary" type="button" disabled={Boolean(saving)}
        onClick={()=>{setSelected(inv.id);setDecision('correct');setReason('');setError('')}}>Correctie aanvragen</button>
      </div>)}
    </div>
    </div>}
   </section>;
  })}
  {preview&&<div className="invoicePdfOverlay" role="dialog" aria-modal="true" aria-label={'Factuur: '+preview.number}>
    <div className="invoicePdfDialog"><div className="invoicePdfDialogHeader"><strong>Factuur {preview.number}</strong>
      <div><a className="button secondary" href={'/api/crew/admin/invoice-extraction/'+preview.id+'/pdf'} target="_blank" rel="noopener noreferrer">Open in nieuw tabblad</a>
      <button type="button" className="button secondary" onClick={()=>setPreview(null)}>Sluiten</button></div></div>
      <iframe title={'Factuur: '+preview.number} className="invoicePdfFrame" src={'/api/crew/admin/invoice-extraction/'+preview.id+'/pdf'}/>
    </div>
  </div>}
 </div>;
}
