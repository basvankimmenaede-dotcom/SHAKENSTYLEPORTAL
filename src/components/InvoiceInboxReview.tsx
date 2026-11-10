'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {FileText,RefreshCw,CheckCircle2,AlertCircle,Link2} from 'lucide-react';

type Attachment={filename:string;path:string;size:number};
type Email={id:string;sender:string|null;subject:string|null;received_at:string|null;status:string;attachments:Attachment[];error_message:string|null};
type Extraction={
 id:string;message_id:string;attachment_index:number;filename:string;storage_path:string;status:string;
 invoice_number:string|null;invoice_date:string|null;total_amount:number|null;supplier_name:string|null;
 suggested_crew_member_id:string|null;extraction_notes:string|null;linked_invoice_id:string|null;
};
type Member={id:string;full_name:string};
function displayDate(date:string|null){return date?new Date(date).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):'Onbekend';}
function formatAmount(value:number|null){return value===null?'Nog niet herkend':Number(value).toLocaleString('nl-NL',{style:'currency',currency:'EUR'});}
function statusLabel(status:string){
 return status==='linked'?'Gekoppeld':status==='extracted'?'Uitgelezen':status==='needs_review'?'Controle nodig':status==='failed'?'Uitlezen mislukt':status==='no_pdf'?'Geen PDF':status==='too_large'?'Te groot':'Ontvangen';
}
function ExtractedInvoice({item,members,canManage,run,busy}:{item:Extraction;members:Member[];canManage:boolean;run:(id:string,payload:Record<string,unknown>)=>Promise<void>;busy:boolean}){
 const [memberId,setMemberId]=useState(item.suggested_crew_member_id||'');
 const [invoiceNumber,setInvoiceNumber]=useState(item.invoice_number||'');
 const [invoiceDate,setInvoiceDate]=useState(item.invoice_date||'');
 const [totalAmount,setTotalAmount]=useState(item.total_amount===null?'':String(item.total_amount));
 const linked=item.status==='linked';
 return <div className="invoiceReviewPdf">
  <div className="invoiceReviewPdfTop">
   <div><FileText size={18}/><strong>{item.filename}</strong><span className={'invoiceReviewStatus '+(linked?'linked':item.status==='failed'?'warning':'')}>{statusLabel(item.status)}</span></div>
   <a className="button secondary" href={'/api/crew/admin/invoice-extraction/'+item.id+'/pdf'} target="_blank" rel="noopener noreferrer">PDF bekijken</a>
  </div>
  {item.status==='failed'?<p className="invoiceReviewHint"><AlertCircle size={16}/> Automatisch uitlezen is niet gelukt. Open het origineel en probeer opnieuw.</p>:<>
   {item.extraction_notes&&<p className="invoiceReviewHint"><AlertCircle size={16}/>{item.extraction_notes}</p>}
   <div className="invoiceReviewFields">
    <label><span>Factuurnummer</span><input className="input" value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} maxLength={64} disabled={linked||!canManage}/></label>
    <label><span>Factuurdatum</span><input className="input" type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} disabled={linked||!canManage}/></label>
    <label><span>Totaalbedrag (€)</span><input className="input" type="number" step="0.01" min="0" value={totalAmount} onChange={e=>setTotalAmount(e.target.value)} placeholder="0,00" disabled={linked||!canManage}/></label>
    <label><span>Bartender</span><select className="select" value={memberId} onChange={e=>setMemberId(e.target.value)} disabled={linked||!canManage}>
     <option value="">Niet gekoppeld / leverancier</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
    </select></label>
   </div>
   <div className="invoiceReviewFooter">
    <span>{linked?'Deze factuur is gekoppeld en zichtbaar in de crewomgeving.':'Controleer de gegevens met de PDF. Onbekende leveranciers blijven zonder crewkoppeling.'}</span>
    {!linked&&canManage&&<button className="button orange" type="button"
      disabled={busy||!memberId||!invoiceNumber.trim()||totalAmount.trim()===''||!Number.isFinite(Number(totalAmount))}
      onClick={()=>run(item.message_id,{action:'link',extractionId:item.id,memberId,invoiceNumber:invoiceNumber.trim(),invoiceDate,totalAmount:Number(totalAmount)})}>
      <Link2 size={15}/> Koppelen aan bartender</button>}
   </div>
  </>}
 </div>;
}
export default function InvoiceInboxReview({emails,extractions,members,canManage}:{emails:Email[];extractions:Extraction[];members:Member[];canManage:boolean}){
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState<string|null>(emails.length===1?emails[0].id:null);
 const router=useRouter();
 async function run(id:string,payload:Record<string,unknown>){
  if(busy)return;
  setBusy(id);setError('');setNotice('');
  try{
   const response=await fetch('/api/crew/admin/invoice-extraction/'+encodeURIComponent(id),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Verwerken is mislukt.');
   setNotice(data.message||'Verwerkt.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Verwerking mislukt.');}
  finally{setBusy(null);}
 }
 return <section className="card invoiceReviewSection">
  <div className="invoiceReviewHeading">
   <div><h2>Binnengekomen facturen</h2><p>E-mails en PDF-bijlagen uit de gekoppelde mailbox. Herkende gegevens moeten worden gecontroleerd voordat ze aan een bartender worden gekoppeld.</p></div>
   <span className="invoiceReviewCounter">{emails.length} e-mails</span>
  </div>
  {(error||notice)&&<p className={'invoiceReviewMessage '+(error?'error':'success')} role={error?'alert':'status'}>{error||notice}</p>}
  {!emails.length?<div className="notice">Er zijn nog geen e-mails gesynchroniseerd.</div>:
   <div className="invoiceReviewList">{emails.map(mail=>{
    const documents=extractions.filter(x=>x.message_id===mail.id);
    const hasPdf=Array.isArray(mail.attachments)&&mail.attachments.length>0;
    const isExpanded=expanded===mail.id;
    return <article className="invoiceReviewItem" key={mail.id}>
      <button type="button" className="invoiceReviewItemHeader" onClick={()=>setExpanded(isExpanded?null:mail.id)} aria-expanded={isExpanded}>
       <span className="invoiceReviewItemSubject"><strong>{mail.subject||'Zonder onderwerp'}</strong><small>{mail.sender||'Afzender onbekend'}</small></span>
       <span className="invoiceReviewItemMeta">{displayDate(mail.received_at)}</span>
       <span className="invoiceReviewItemMeta">{mail.attachments?.length||0} PDF</span>
       <span className={'invoiceReviewStatus '+(documents.some(x=>x.status==='linked')?'linked':'')}>{documents.length?documents.some(x=>x.status==='linked')?'Gekoppeld':documents.every(x=>x.status==='failed')?'Controle nodig':'Uitgelezen':statusLabel(mail.status)}</span>
       <span className="invoiceReviewChevron">{isExpanded?'−':'+'}</span>
      </button>
      {isExpanded&&<div className="invoiceReviewExpanded">
       {mail.error_message&&<p className="invoiceReviewHint">{mail.error_message}</p>}
       {!hasPdf?<p className="muted">Geen bruikbare PDF-bijlage gevonden.</p>:<>
        {!documents.length&&<div className="invoiceReviewUnprocessed">
         <span>Deze PDF is ontvangen, maar nog niet inhoudelijk uitgelezen.</span>
         {canManage&&<button className="button orange" disabled={Boolean(busy)} type="button" onClick={()=>run(mail.id,{action:'extract'})}><RefreshCw size={15}/> {busy===mail.id?'Verwerken…':'PDF uitlezen'}</button>}
        </div>}
        {documents.map(item=><ExtractedInvoice key={item.id} item={item} members={members} canManage={canManage} run={run} busy={Boolean(busy)}/>)}
        {canManage&&documents.length>0&&documents.every(x=>x.status==='failed')&&<button className="button secondary" disabled={Boolean(busy)} type="button" onClick={()=>run(mail.id,{action:'extract'})}><RefreshCw size={15}/> Opnieuw uitlezen</button>}
       </>}
      </div>}
    </article>;
   })}</div>}
 </section>;
}
