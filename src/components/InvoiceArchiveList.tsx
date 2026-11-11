'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {FileText,Mail,ArchiveRestore} from 'lucide-react';
import type {InvoiceCheck} from '@/lib/invoice-shift-comparison';
import InvoiceShiftComparison from '@/components/InvoiceShiftComparison';
type ArchivedInvoice={
 id:string;invoice_number:string;name:string;total_amount:number|null;billing_item_id:string|null;
 supplier_id:string|null;cost_category:string|null;
 status:string;correction_reason:string|null;updated_at:string;
 forwarded_at:string|null;forward_to:string|null;extraction_id:string|null;
 project_numbers:string[];
};
type ArchivedEmail={id:string;subject:string|null;sender:string|null;received_at:string|null;archive_reason:string|null;archived_at:string|null};
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('nl-NL'):'—';
export default function InvoiceArchiveList({invoices,emails,comparisons,canManage}:{
 invoices:ArchivedInvoice[];emails:ArchivedEmail[];comparisons:Record<string,InvoiceCheck>;canManage:boolean;
}){
 const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 async function restore(id:string){
  if(!canManage||busy)return;
  setBusy(id);setError('');
  try{
   const response=await fetch('/api/crew/admin/invoice-extraction/'+encodeURIComponent(id),{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'restore'})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Herstellen mislukt.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Herstellen mislukt.');}
  finally{setBusy(null);}
 }
 return <div className="invoiceArchiveList">
  {error&&<p className="invoiceReviewMessage error" role="alert">{error}</p>}
  {!invoices.length&&!emails.length&&<div className="notice">Geen documenten in het archief voor deze selectie.</div>}
  {invoices.map(inv=>{const rejected=inv.status==='rejected';return <details className="invoiceArchiveEntry" key={inv.id}>
   <summary>
    <span className="invoiceArchiveFile"><FileText size={18}/><span><strong>{inv.name} · {inv.invoice_number}</strong>
     <small>{(inv.project_numbers||[]).map(n=>'#'+n).join(' · ')||(inv.supplier_id?'Algemene kosten':'Projectnummer niet vastgelegd')}</small></span></span>
    <span>{inv.total_amount===null?'Bedrag onbekend':Number(inv.total_amount).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})}</span>
    <span>{date(rejected?inv.updated_at:inv.forwarded_at)}</span>
    <span className={'invoiceReviewStatus '+(rejected?'rejected':'linked')}>{rejected?'Afgekeurd':'Afgehandeld'}</span>
    <span>⌄</span>
   </summary>
   <div className="invoiceArchiveEntryDetail">
    {rejected?<><p>Factuur afgekeurd, niet doorgestuurd en eventueel eerste akkoord ingetrokken.</p>
     <p><strong>Reden:</strong> {inv.correction_reason||'Geen reden geregistreerd.'}</p></>:
     <p>Goedgekeurd door twee accounts en verzonden via SMTP naar {inv.forward_to||'het boekhoudadres'} op {date(inv.forwarded_at)}. Ontvangst door de boekhouding is niet afzonderlijk bevestigd.</p>}
    {inv.extraction_id&&<a className="button secondary" href={'/api/crew/admin/invoice-extraction/'+inv.extraction_id+'/pdf'}
      target="_blank" rel="noopener noreferrer">Originele PDF bekijken</a>}
    {canManage&&inv.supplier_id&&!rejected&&<a className="button secondary"
      href={inv.billing_item_id?'/planning/billing':'/planning/billing?supplierInvoice='+encodeURIComponent(inv.id)}>
      {inv.billing_item_id?'Gekoppeld aan facturatie':'Koppelen aan handmatige factuur'}
    </a>}
    {comparisons[inv.id]&&comparisons[inv.id].projects.length>0&&<InvoiceShiftComparison comparison={comparisons[inv.id]}/>}
   </div>
  </details>;})}
  {emails.length>0&&<section className="invoiceArchivedOther">
   <h3>Overige gearchiveerde e-mails</h3>
   {emails.map(mail=><div className="invoiceArchivedEmail" key={mail.id}>
    <Mail size={17}/><span><strong>{mail.subject||'Zonder onderwerp'}</strong>
     <small>{mail.sender||'Afzender onbekend'} · {date(mail.archived_at)} · {mail.archive_reason||'Handmatig gearchiveerd'}</small></span>
    {canManage&&<button className="button secondary" type="button" disabled={busy===mail.id} onClick={()=>void restore(mail.id)}>
      <ArchiveRestore size={15}/> Herstellen
    </button>}
   </div>)}
  </section>}
  <div className="invoiceArchiveNote">Facturen blijven bewaard met hun originele PDF en goedkeuringen. Het archief verwijdert geen bestanden.</div>
 </div>;
}
