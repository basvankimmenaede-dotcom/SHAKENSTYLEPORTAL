'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2,Clock3,MailCheck,AlertTriangle} from 'lucide-react';

type Invoice={
 id:string;invoice_number:string;name:string;total_amount:number|null;status:string;
 correction_reason:string|null;created_at:string;approved_first_by:string|null;approved_second_by:string|null;
 approval_policy_one:string|null;approval_policy_two:string|null;forward_to:string|null;
 forwarded_at:string|null;forward_attempted_at:string|null;forward_error:string|null;
};
type Approver={id:string;full_name:string};
export default function CrewInvoiceAdminList({invoices,canManage,currentUserId,approvers,configuredOne,configuredTwo,configuredForwardTo}:{
 invoices:Invoice[];canManage:boolean;currentUserId:string;approvers:Approver[];
 configuredOne:string;configuredTwo:string;configuredForwardTo:string;
}){
 const [selected,setSelected]=useState<string|null>(null);
 const [reason,setReason]=useState('');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState<string|null>(null);
 const [notice,setNotice]=useState('');
 const router=useRouter();
 const labels:Record<string,string>={
  received:'Ontvangen',in_review:'In behandeling',correction_sending:'Correctiemail controleren',
  correction_needed:'Correctie nodig',approved:'Goedgekeurd'
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
   setSelected(null);setReason('');setNotice(result.message||'Verwerkt.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Actie mislukt.');}
  finally{setSaving(null);}
 }
 if(invoices.length===0)return <div className="notice">Nog geen facturen aan een bartender gekoppeld. Controleer hierboven de ontvangen PDF’s en koppel ze na beoordeling.</div>;
 return <div className="stack">
  {(error||notice)&&<p className={'invoiceProcessMessage '+(error?'error':'success')} role={error?'alert':'status'}>{error||notice}</p>}
  {!ready&&<div className="notice">Stel eerst twee goedkeurders en het boekhoudadres in bij <Link href="/planning/instellingen/factuurverwerking">Factuurverwerking</Link>.</div>}
  {invoices.map(inv=>{
   const first=inv.approved_first_by,second=inv.approved_second_by;
   const approverIds=[inv.approval_policy_one||configuredOne,inv.approval_policy_two||configuredTwo];
   const allowed=canManage&&ready&&approverIds.includes(currentUserId)&&currentUserId!==first&&!second&&!inv.forward_attempted_at
     &&['received','in_review'].includes(inv.status);
   const forwarding=Boolean(second&&!inv.forwarded_at);
   const approved=inv.status==='approved'&&Boolean(inv.forwarded_at);
   return <section key={inv.id} className="card invoiceApprovalCard">
    <div className="invoiceApprovalTop">
     <div><strong>{inv.name}</strong>
      <span>{inv.invoice_number} · {inv.total_amount===null?'Bedrag onbekend':Number(inv.total_amount).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})}</span>
     </div><span className={'invoiceReviewStatus '+(approved?'linked':forwarding?'warning':'')}>{forwarding?'Doorsturen controleren':labels[inv.status]||'In behandeling'}</span>
    </div>
    {inv.correction_reason&&<p className="muted">Correctiereden: {inv.correction_reason}</p>}
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
     {allowed&&<button className="button orange" type="button" disabled={Boolean(saving)}
      onClick={()=>post(inv.id,'/api/crew/admin/invoices/'+inv.id+'/approve')}>
      {saving===inv.id?'Verwerken…':first?'Tweede akkoord & doorsturen':'Factuur goedkeuren (1/2)'}
     </button>}
     {canManage&&['received','in_review'].includes(inv.status)&&!first&&
      (selected===inv.id?<div className="invoiceApprovalCorrection">
       <label htmlFor={'reason-'+inv.id}>Wat moet de bartender aanpassen?</label>
       <textarea id={'reason-'+inv.id} className="input" rows={3} maxLength={1500} value={reason}
        onChange={e=>setReason(e.target.value)} placeholder="Beschrijf het verschil met het shiftrapport."/>
       <div><button className="button secondary" type="button" disabled={Boolean(saving)||reason.trim().length<8}
        onClick={()=>post(inv.id,'/api/crew/admin/invoices/'+inv.id+'/request-correction',{reason:reason.trim()})}>Correctiemail versturen</button>
       <button className="button secondary" type="button" disabled={Boolean(saving)} onClick={()=>{setSelected(null);setReason('');setError('')}}>Annuleren</button></div>
      </div>:<button className="button secondary" type="button" onClick={()=>{setSelected(inv.id);setReason('');setError('')}}>Correctie aanvragen</button>)}
    </div>
   </section>;
  })}
 </div>;
}
