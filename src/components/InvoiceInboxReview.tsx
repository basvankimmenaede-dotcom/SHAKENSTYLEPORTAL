'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {FileText,RefreshCw,AlertCircle,Link2} from 'lucide-react';
import {INVOICE_SUPPLIER_CATEGORIES,INVOICE_COST_CATEGORY_LABELS,type InvoiceCostCategory,type InvoiceSupplier} from '@/lib/invoice-suppliers';

type Attachment={filename:string;path:string;size:number};
type Email={id:string;sender:string|null;subject:string|null;received_at:string|null;status:string;attachments:Attachment[];error_message:string|null};
type Extraction={
 id:string;message_id:string;attachment_index:number;filename:string;storage_path:string;status:string;
 invoice_number:string|null;invoice_date:string|null;total_amount:number|null;supplier_name:string|null;
 suggested_crew_member_id:string|null;match_strength:string|null;match_reason:string|null;extraction_notes:string|null;linked_invoice_id:string|null;
 processing_provider:string|null;processed_at:string|null;
 project_numbers:string[];project_lines:{project_number:string;work_hours:number|null;travel_hours:number|null;expenses_amount:number|null}[];
};
type Member={id:string;full_name:string;company_name:string|null;company_alias:string|null;invoice_email:string|null;email:string|null;rentman_email:string|null;login_email_override:string|null};
function displayDate(date:string|null){return date?new Date(date).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):'Onbekend';}
function statusLabel(status:string){
 return status==='linked'?'Gekoppeld':status==='extracted'?'Uitgelezen':status==='needs_review'?'Controle nodig':status==='failed'?'Uitlezen mislukt':status==='no_pdf'?'Geen PDF':status==='too_large'?'Te groot':'Ontvangen';
}
function ExtractedInvoice({item,members,suppliers,canManage,run,busy,openPdf}:{item:Extraction;members:Member[];suppliers:InvoiceSupplier[];canManage:boolean;run:(id:string,payload:Record<string,unknown>)=>Promise<void>;busy:boolean;openPdf:(messageId:string,index:number,filename:string)=>void}){
 const supplierSuggestion=suppliers.find(s=>s.company_name.toLowerCase()===String(item.supplier_name||'').trim().toLowerCase());
 const [partyType,setPartyType]=useState<'crew'|'supplier'>(supplierSuggestion&&!item.suggested_crew_member_id?'supplier':'crew');
 const [memberId,setMemberId]=useState(item.suggested_crew_member_id||'');
 const [supplierId,setSupplierId]=useState(supplierSuggestion?.id||'');
 const [category,setCategory]=useState<InvoiceCostCategory>(supplierSuggestion?.default_cost_category||'overig');
 const [invoiceNumber,setInvoiceNumber]=useState(item.invoice_number||'');
 const [invoiceDate,setInvoiceDate]=useState(item.invoice_date||'');
 const [totalAmount,setTotalAmount]=useState(item.total_amount===null?'':String(item.total_amount));
 const [projectText,setProjectText]=useState((item.project_numbers||[]).join(', '));
 const [projectLines,setProjectLines]=useState<Record<string,{work_hours:string;travel_hours:string;expenses_amount:string}>>(
  Object.fromEntries((item.project_lines||[]).map(line=>[line.project_number,{
   work_hours:line.work_hours===null?'':String(line.work_hours),
   travel_hours:line.travel_hours===null?'':String(line.travel_hours),
   expenses_amount:line.expenses_amount===null?'':String(line.expenses_amount)
  }]))
 );
 const projectNumbers=[...new Set(projectText.split(/[;,\s]+/).map(n=>n.trim()).filter(Boolean))].slice(0,15);
 const projectFormatValid=projectNumbers.every(n=>/^\d{4,8}$/.test(n));
 const changeProjectLine=(number:string,key:'work_hours'|'travel_hours'|'expenses_amount',value:string)=>
  setProjectLines(previous=>({...previous,[number]:{...(previous[number]||{work_hours:'',travel_hours:'',expenses_amount:''}),[key]:value}}));
 const linked=item.status==='linked';
 return <div className="invoiceReviewPdf">
  <div className="invoiceReviewPdfTop">
   <div><FileText size={18}/><strong>{item.filename}</strong><span className={'invoiceReviewStatus '+(linked?'linked':item.status==='failed'?'warning':'')}>{statusLabel(item.status)}</span>
    <span className="invoiceRecognitionMethod">{item.processing_provider==='google_document_ai'?'Google Document AI':
     item.processing_provider==='pdf_text'?'Automatisch uit PDF':'Handmatig ingevoerd'}</span></div>
   <button type="button" className="button secondary" onClick={()=>openPdf(item.message_id,item.attachment_index,item.filename)}>PDF bekijken</button>
  </div>
  {item.status==='failed'?<div className="invoiceRecognitionFailure">
   <p className="invoiceReviewHint"><AlertCircle size={16}/> {item.extraction_notes||'Deze PDF kon niet automatisch worden uitgelezen.'}</p>
   {canManage&&<div className="invoicePdfUnprocessedActions">
    <button type="button" className="button secondary" disabled={busy} onClick={()=>run(item.message_id,{action:'prepare',attachmentIndex:item.attachment_index})}>Handmatig invullen</button>
    <button type="button" className="button secondary" disabled={busy} onClick={()=>run(item.message_id,{action:'extract'})}>Opnieuw herkennen</button>
   </div>}
  </div>:<>
   {item.extraction_notes&&<p className="invoiceReviewHint"><AlertCircle size={16}/>{item.extraction_notes}</p>}
   <div className={'crewInvoiceMatchBanner '+(item.match_strength==='strong'?'strong':item.match_strength==='ambiguous'?'ambiguous':'')}>
    <div>
     <strong>{partyType==='supplier'?(supplierSuggestion?'Mogelijke leverancier: '+supplierSuggestion.company_name:'Kies de leverancier handmatig'):(item.suggested_crew_member_id?'Voorgestelde bartender: '+(members.find(m=>m.id===item.suggested_crew_member_id)?.full_name||'Onbekend'):'Bartender handmatig kiezen')}</strong>
     <span className="invoiceRecognitionStrength">{item.match_strength==='strong'?'Sterke overeenkomst':item.match_strength==='ambiguous'?'Tegenstrijdige gegevens':item.match_strength==='possible'?'Mogelijke overeenkomst':'Geen overeenkomst'}</span>
     <span>{item.match_reason||'Geen automatische overeenkomst gevonden. Je kunt de factuur handmatig koppelen.'}</span>
     {item.supplier_name&&<small>Leverancier op factuur: {item.supplier_name}</small>}
     
    </div>
   </div>
   <div className="invoiceReviewFields">
    <label><span>Factuurnummer</span><input className="input" value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} maxLength={64} disabled={linked||!canManage}/></label>
    <label><span>Factuurdatum</span><input className="input" type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} disabled={linked||!canManage}/></label>
    <label><span>Totaalbedrag (€)</span><input className="input" type="number" step="0.01" min="0" value={totalAmount} onChange={e=>setTotalAmount(e.target.value)} placeholder="0,00" disabled={linked||!canManage}/></label>
    <label><span>Type factuur</span><select className="select" value={partyType} onChange={e=>setPartyType(e.target.value==='supplier'?'supplier':'crew')} disabled={linked||!canManage}>
     <option value="crew">Bartender / freelance personeel</option><option value="supplier">Andere leverancier</option>
    </select></label>
    {partyType==='crew'?<label><span>Bartender</span><select className="select" value={memberId} onChange={e=>setMemberId(e.target.value)} disabled={linked||!canManage}>
     <option value="">Kies bartender</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}{m.company_name?' · '+m.company_name:''}</option>)}
    </select></label>:
    <><label><span>Leverancier</span><select className="select" value={supplierId} onChange={e=>{
      const id=e.target.value;setSupplierId(id);
      setCategory(suppliers.find(s=>s.id===id)?.default_cost_category||'overig');
     }} disabled={linked||!canManage}>
      <option value="">Kies leverancier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.company_name}</option>)}
     </select></label>
     <label><span>Kostensoort</span><select className="select" value={category} onChange={e=>setCategory(e.target.value as InvoiceCostCategory)} disabled={linked||!canManage}>
      {INVOICE_SUPPLIER_CATEGORIES.map(k=><option key={k} value={k}>{INVOICE_COST_CATEGORY_LABELS[k]}</option>)}
     </select></label></>}
   </div>
   <div className="invoiceProjectEntry">
     <label><span>{partyType==='supplier'?'Rentman-projectnummer(s) (optioneel)':'Projectnummer(s) op de PDF'}</span><input className="input" value={projectText}
       placeholder="Bijv. 11057, 11059" onChange={e=>setProjectText(e.target.value)} disabled={linked||!canManage}/></label>
     <small>Vul meerdere nummers gescheiden door een komma in. Dit zijn Rentman-projectnummers, geen interne ID’s.</small>
     {partyType==='supplier'&&<p className="invoiceProjectHoursHint">Geen project? Laat dit veld leeg. Deze factuur wordt geboekt op de gekozen kostensoort.</p>}
     {partyType==='crew'&&projectNumbers.length>0&&projectFormatValid&&<div className="invoiceProjectHours">
       {projectNumbers.map(number=><div className="invoiceProjectHoursRow" key={number}>
        <strong>#{number}</strong>
        {([
          ['work_hours','Gewerkte uren'],
          ['travel_hours','Reisuren'],
          ['expenses_amount','Onkosten (€)']
         ] as const).map(([key,label])=><label key={key}><span>{label}</span>
         <input className="input" type="number" step="0.01" min="0" placeholder="Niet herkend"
          disabled={linked||!canManage}
          value={projectLines[number]?.[key]||''}
          onChange={e=>changeProjectLine(number,key,e.target.value)}
         /></label>)}
       </div>)}
       <p className="invoiceProjectHoursHint">Laat ontbrekende uren leeg; ga niet uit van de geplande tijden. De portal vergelijkt alleen ingevulde gegevens met ingediende shiftrapporten.</p>
      </div>}
     {!projectFormatValid&&<p className="invoiceProjectHoursHint">Gebruik alleen geldige projectnummers van 4 tot 8 cijfers.</p>}
    </div>
   <div className="invoiceReviewFooter">
    <span>{linked?'Deze factuur is gekoppeld.':partyType==='supplier'?'Controleer de gegevens met de originele PDF. Projectkoppeling is optioneel.':'Controleer de herkende gegevens met de PDF. Je moet de koppeling altijd zelf bevestigen.'}</span>
    {!linked&&canManage&&<button className="button secondary" type="button" disabled={busy} onClick={()=>{
      if(window.confirm('Deze PDF opnieuw herkennen? Nog niet gekoppelde invoervelden worden opnieuw gevuld.'))
       void run(item.message_id,{action:'extract'});
    }}>Opnieuw herkennen</button>}
    {!linked&&canManage&&<button className="button orange" type="button"
      disabled={busy||(partyType==='crew'?!memberId:!supplierId)||!projectFormatValid||!invoiceNumber.trim()||totalAmount.trim()===''||!Number.isFinite(Number(totalAmount))}
      onClick={()=>run(item.message_id,{action:'link',extractionId:item.id,partyType,memberId,supplierId,costCategory:category,invoiceNumber:invoiceNumber.trim(),invoiceDate,totalAmount:Number(totalAmount),
       projectNumbers,projectLines:partyType==='crew'?projectNumbers.map(project_number=>({
        project_number,work_hours:projectLines[project_number]?.work_hours||null,
        travel_hours:projectLines[project_number]?.travel_hours||null,
        expenses_amount:projectLines[project_number]?.expenses_amount||null
       })):[]})}>
      <Link2 size={15}/> {partyType==='crew'?'Koppelen aan bartender':'Koppelen aan leverancier'}</button>}
   </div>
  </>}
 </div>;
}
export default function InvoiceInboxReview({emails,extractions,members,suppliers,canManage}:{emails:Email[];extractions:Extraction[];members:Member[];suppliers:InvoiceSupplier[];canManage:boolean}){
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  if(!notice)return;
  const timer=window.setTimeout(()=>setNotice(''),5000);
  return ()=>window.clearTimeout(timer);
 },[notice]);
 const [expanded,setExpanded]=useState<string|null>(emails.length===1?emails[0].id:null);
 const [preview,setPreview]=useState<{id:string;index:number;filename:string}|null>(null);
 const openPdf=(id:string,index:number,filename:string)=>setPreview({id,index,filename});
 const router=useRouter();
 async function run(id:string,payload:Record<string,unknown>){
  if(busy)return;
  setBusy(id);setError('');setNotice('');
  try{
   const response=await fetch('/api/crew/admin/invoice-extraction/'+encodeURIComponent(id),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
   });
   const contentType=response.headers.get('content-type')||'';
   const data=contentType.includes('application/json')?await response.json():{error:'De server gaf geen geldig antwoord. Controleer je sessie of probeer opnieuw.'};
   if(!response.ok)throw new Error(data.error||'Verwerken is mislukt.');
   setNotice(data.message||'Verwerkt.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Verwerking mislukt.');}
  finally{setBusy(null);}
 }
 return <section className="card invoiceReviewSection">
  <div className="invoiceReviewHeading">
   <div><h2>Binnengekomen facturen</h2><p>E-mails en PDF-bijlagen uit de factuurmailbox. Koppel de factuur aan een bartender of leverancier na controle van de originele PDF.</p></div>
   <span className="invoiceReviewCounter">{emails.length} e-mails</span>
  </div>
  {(error||notice)&&<p className={'invoiceReviewMessage '+(error?'error':'success')} role={error?'alert':'status'}>{error||notice}</p>}
  {!emails.length?<p className="invoiceReviewEmpty">Geen openstaande facturen</p>:
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
         <span>Deze PDF is ontvangen. Herken de gegevens automatisch uit de PDF of vul ze handmatig in.</span>
         <div className="invoicePdfUnprocessedActions">{mail.attachments.map((file,i)=><button type="button" className="button secondary" key={i} onClick={()=>openPdf(mail.id,i,file.filename)}>PDF bekijken</button>)}
         {canManage&&mail.attachments.map((file,i)=><button key={i} className="button secondary" disabled={Boolean(busy)} type="button" onClick={()=>run(mail.id,{action:'prepare',attachmentIndex:i})}>Handmatig {mail.attachments.length>1?String(i+1):'invullen'}</button>)}
         {canManage&&<button className="button orange" disabled={Boolean(busy)} type="button" onClick={()=>run(mail.id,{action:'extract'})}><RefreshCw size={15}/> {busy===mail.id?'Verwerken…':'Automatisch herkennen'}</button>}</div>
        </div>}
        {documents.map(item=><ExtractedInvoice key={item.id+':'+(item.processed_at||'')} item={item} members={members} suppliers={suppliers} canManage={canManage} run={run} busy={Boolean(busy)} openPdf={openPdf}/>)}
        {canManage&&documents.length>0&&documents.every(x=>x.status==='failed')&&<button className="button secondary" disabled={Boolean(busy)} type="button" onClick={()=>run(mail.id,{action:'extract'})}><RefreshCw size={15}/> Opnieuw automatisch herkennen</button>}
       </>}
       {canManage&&<div className="invoiceEmailArchiveAction"><button type="button" className="button secondary"
        disabled={Boolean(busy)} onClick={()=>{
          const reason=window.prompt('Waarom moet deze e-mail naar het archief?');
          if(reason?.trim()&&reason.trim().length>=5)void run(mail.id,{action:'archive',reason:reason.trim()});
        }}>E-mail archiveren</button><small>Voor dubbele of niet-relevante e-mails. De originele PDF blijft bewaard.</small></div>}
      </div>}
    </article>;
   })}</div>}
   {preview&&<div className="invoicePdfOverlay" role="dialog" aria-modal="true" aria-label={'Factuur bekijken: '+preview.filename}>
     <div className="invoicePdfDialog">
       <div className="invoicePdfDialogHeader">
         <strong>{preview.filename}</strong>
         <div><a href={'/api/crew/admin/invoice-messages/'+preview.id+'/pdf/'+preview.index}
           target="_blank" rel="noopener noreferrer" className="button secondary">Open in nieuw tabblad</a>
         <button className="button secondary" type="button" onClick={()=>setPreview(null)}>Sluiten</button></div>
       </div>
       <iframe title={'PDF: '+preview.filename}
         src={'/api/crew/admin/invoice-messages/'+preview.id+'/pdf/'+preview.index}
         className="invoicePdfFrame"/>
     </div>
   </div>}
 </section>;
}
