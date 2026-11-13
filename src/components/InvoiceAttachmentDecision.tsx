
'use client';
import {useState} from 'react';
export type AttachmentReview={id:string;extraction_id:string;message_id:string;attachment_index:number;
 classification:'receipt'|'evidence'|'ignored';merchant:string|null;document_date:string|null;cost_amount:number|null;
 project_number:string|null;linked_invoice_id:string|null;note:string|null;billing_status:string};
type Doc={id:string;message_id:string;filename:string;status:string;supplier_name:string|null;total_amount:number|null;
 invoice_date:string|null;project_numbers:string[]};
type LinkedOption={id:string;filename:string};
export default function InvoiceAttachmentDecision({item,review,linkedOptions,canManage,busy,run}:{
 item:Doc;review:AttachmentReview|null;linkedOptions:LinkedOption[];canManage:boolean;busy:boolean;
 run:(id:string,payload:Record<string,unknown>)=>Promise<void>;
}){
 const [kind,setKind]=useState<'receipt'|'evidence'|'ignored'|''>('');
 const [merchant,setMerchant]=useState(item.supplier_name||'');
 const [amount,setAmount]=useState(item.total_amount===null?'':String(item.total_amount));
 const [date,setDate]=useState(item.invoice_date||'');
 const [projectNumber,setProjectNumber]=useState(item.project_numbers?.length===1?item.project_numbers[0]:'');
 const [linkedInvoiceId,setLinkedInvoiceId]=useState('');
 const [note,setNote]=useState('');
 if(review)return <div className="invoiceReviewHint" style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center',marginTop:10}}>
  <div><strong>{review.classification==='receipt'?'Bonnetje / mogelijke projectkosten':review.classification==='evidence'?'Bewijsstuk bij factuur':'Niet relevant / duplicaat'}</strong>
   <div style={{fontSize:12,marginTop:3}}>{review.classification==='receipt'?
    (review.merchant||item.filename)+' · '+(review.cost_amount===null?'Bedrag onbekend':Number(review.cost_amount).toLocaleString('nl-NL',{style:'currency',currency:'EUR'}))+
    (review.project_number?' · project #'+review.project_number:' · nog niet toegewezen')+
    ' · '+(review.billing_status==='included'?'doorbelast':review.billing_status==='already_processed'?'al verwerkt':review.billing_status==='not_bill'?'niet doorbelasten':'te beoordelen'):
    review.note||(review.classification==='evidence'?'Bewijsstuk opgeslagen':'Gearchiveerd')}</div>
  </div>
  {canManage&&review.billing_status!=='included'&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void run(item.id,{action:'reopen'})}>Keuze herstellen</button>}
 </div>;
 if(item.status==='linked'||!canManage)return null;
 const canSave=(kind==='receipt'&&merchant.trim()&&amount.trim()!==''&&Number.isFinite(Number(amount))&&Number(amount)>=0&&(!projectNumber||/^\d{4,8}$/.test(projectNumber)))||
  (kind==='evidence'&&linkedInvoiceId)||
  (kind==='ignored'&&note.trim().length>=5);
 return <div style={{background:'var(--surface-alt,transparent)',border:'1px solid var(--border,#ddd)',borderRadius:9,padding:12,marginTop:14}}>
  <strong style={{fontSize:13}}>Is dit een factuur of een ander soort bijlage?</strong>
  <p style={{fontSize:12,color:'var(--muted)',margin:'5px 0 10px'}}>Kies hieronder als dit een kassabon, bewijsstuk of niet-relevante PDF is. Maak er dan geen nieuwe bartenderfactuur van.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button type="button" className={'button '+(kind==='receipt'?'orange':'secondary')} disabled={busy} onClick={()=>setKind(kind==='receipt'?'':'receipt')}>Bonnetje / projectkosten</button>
   {linkedOptions.length>0&&<button type="button" className={'button '+(kind==='evidence'?'orange':'secondary')} disabled={busy} onClick={()=>setKind(kind==='evidence'?'':'evidence')}>Bewijsstuk bij factuur</button>}
   <button type="button" className={'button '+(kind==='ignored'?'orange':'secondary')} disabled={busy} onClick={()=>setKind(kind==='ignored'?'':'ignored')}>Niet relevant / duplicaat</button>
  </div>
  {kind&&<div style={{marginTop:12,display:'grid',gap:9}}>
   {kind==='receipt'&&<>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8}}>
     <label style={{fontSize:12}}>Winkel / leverancier<input className="input" value={merchant} maxLength={150} onChange={e=>setMerchant(e.target.value)}/></label>
     <label style={{fontSize:12}}>Bonbedrag incl. btw (indien van toepassing)<input className="input" type="number" step="0.01" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label style={{fontSize:12}}>Datum<input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label style={{fontSize:12}}>Rentman-projectnummer (optioneel)<input className="input" value={projectNumber} placeholder="Bijv. 11059" onChange={e=>setProjectNumber(e.target.value)} /></label>
    </div>
    <p style={{fontSize:12,color:'var(--muted)',margin:0}}>Het bonbedrag wordt niet automatisch aan de klant gefactureerd. Je kiest later de verkoopprijs excl. btw onder Uitgaande facturen.</p>
    {linkedOptions.length>0&&<label style={{fontSize:12}}>Ook als bewijsstuk bij inkomende factuur (optioneel)
     <select className="select" value={linkedInvoiceId} onChange={e=>setLinkedInvoiceId(e.target.value)}><option value="">Niet koppelen</option>
      {linkedOptions.map(o=><option value={o.id} key={o.id}>{o.filename}</option>)}</select></label>}
   </>}
   {kind==='evidence'&&<label style={{fontSize:12}}>Koppelen aan ontvangen factuur
     <select className="select" value={linkedInvoiceId} onChange={e=>setLinkedInvoiceId(e.target.value)}>
      <option value="">Kies een factuur</option>{linkedOptions.map(o=><option value={o.id} key={o.id}>{o.filename}</option>)}
     </select></label>}
   {kind!=='evidence'&&<label style={{fontSize:12}}>{kind==='ignored'?'Reden (verplicht)':'Toelichting (optioneel)'}
    <input className="input" value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder={kind==='ignored'?'Bijvoorbeeld: dubbel doorgestuurd':'Bijvoorbeeld: drank voor event'} /></label>}
   <div><button type="button" className="button orange" disabled={busy||!canSave} onClick={()=>void run(item.id,{
    action:'classify',kind,merchant,amount:kind==='receipt'?Number(amount):null,
    documentDate:date||null,projectNumber:kind==='receipt'?projectNumber.trim():'',
    linkedInvoiceId:kind==='evidence'||kind==='receipt'?linkedInvoiceId:'',note
   })}>Bijlage verwerken</button></div>
  </div>}
 </div>;
}
