'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {recognizeReceiptText} from '@/lib/receipt-recognition';
import {INVOICE_SUPPLIER_CATEGORIES,INVOICE_COST_CATEGORY_LABELS,type InvoiceSupplier} from '@/lib/invoice-suppliers';

type Props={suppliers:InvoiceSupplier[];canManage:boolean};
type ApiResult={ok?:boolean;path?:string;token?:string;uploadId?:string;message?:string;error?:string;code?:string};
type ApiError=Error&{code?:string};
const MAX_BYTES=15*1024*1024;
const isImage=(file:File)=>/^(image\/jpeg|image\/png)$/.test(file.type)||/\.(jpe?g|png)$/i.test(file.name);
const isPdf=(file:File)=>file.type==='application/pdf'||/\.pdf$/i.test(file.name);
function supplierKey(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
async function receiptId(file:File):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return 'BON-'+Array.from(new Uint8Array(digest)).slice(0,12).map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}
async function pdfForUpload(file:File):Promise<File>{
 if(isPdf(file))return file;
 if(!isImage(file))throw new Error('Alleen PDF, JPG of PNG worden ondersteund.');
 const {PDFDocument}=await import('pdf-lib');
 const doc=await PDFDocument.create();
 const buffer=await file.arrayBuffer();
 const image=/\.png$/i.test(file.name)||file.type==='image/png'?
  await doc.embedPng(buffer):await doc.embedJpg(buffer);
 const pageWidth=Math.min(595,Math.max(240,image.width*.72));
 const pageHeight=Math.min(12000,pageWidth*image.height/image.width);
 const page=doc.addPage([pageWidth,pageHeight]);
 page.drawImage(image,{x:0,y:0,width:pageWidth,height:pageHeight});
 const pdfBytes=await doc.save({useObjectStreams:false});
 if(pdfBytes.byteLength>MAX_BYTES)throw new Error('De geconverteerde PDF is groter dan 15 MB. Gebruik een kleinere foto.');
 const safeName=file.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').slice(0,60);
 return new File([new Uint8Array(pdfBytes).slice().buffer],(safeName||'Bon')+'.pdf',{type:'application/pdf'});
}
export default function InvoiceManualSupplierAdd({suppliers,canManage}:Props){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [supplierId,setSupplierId]=useState('');
 const [category,setCategory]=useState('overig');
 const [number,setNumber]=useState('');
 const [date,setDate]=useState('');
 const [amount,setAmount]=useState('');
 const [project,setProject]=useState('');
 const [file,setFile]=useState<File|null>(null);
 const [receiptMode,setReceiptMode]=useState(false);
 const [ocrStatus,setOcrStatus]=useState<'idle'|'reading'|'ready'|'failed'>('idle');
 const [ocrText,setOcrText]=useState('');
 const [ocrConfidence,setOcrConfidence]=useState<number|null>(null);
 const [detectedSupplier,setDetectedSupplier]=useState('');
 const [detectedReceiptNumber,setDetectedReceiptNumber]=useState('');
 const [vatLines,setVatLines]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const latestScan=useRef(0);
 useEffect(()=>{
  if(!notice)return;
  const timer=window.setTimeout(()=>setNotice(''),5000);
  return ()=>window.clearTimeout(timer);
 },[notice]);
 if(!canManage)return null;
 async function request(action:string,payload:Record<string,unknown>={}):Promise<ApiResult>{
  const response=await fetch('/api/crew/admin/invoice-manual',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})
  });
  const result:ApiResult=await response.json().catch(()=>({error:'De server gaf geen geldig antwoord.'}));
  if(!response.ok){
   const err=new Error(result.error||'Verwerken is mislukt.') as ApiError;
   err.code=result.code;throw err;
  }
  return result;
 }
 async function analyzePhoto(selected:File,scanId:number){
  setOcrStatus('reading');
  let worker:Awaited<ReturnType<typeof import('tesseract.js').createWorker>>|null=null;
  try{
   const {createWorker}=await import('tesseract.js');
   try{worker=await createWorker(['nld','eng']);}
   catch{worker=await createWorker('eng');}
   const outcome=await worker.recognize(selected);
   if(scanId!==latestScan.current)return;
   const text=String(outcome.data.text||'').slice(0,10000);
   const result=recognizeReceiptText(text);
   const confidence=Number(outcome.data.confidence||0);
   setOcrText(text);
   setOcrConfidence(Math.round(confidence));
   setDetectedSupplier(result.supplierName||'');
   setDetectedReceiptNumber(result.receiptNumber||'');
   setVatLines(result.vatLines);
   if(result.date)setDate(result.date);
   if(result.total!==null)setAmount(result.total.toFixed(2));
   const key=supplierKey(result.supplierName||'');
   const matched=key.length>3?suppliers.find(s=>{
    const k=supplierKey(s.company_name);
    return k===key||k.includes(key)||key.includes(k);
   }):undefined;
   if(matched){setSupplierId(matched.id);setCategory(matched.default_cost_category);}
   setOcrStatus(text.trim()?'ready':'failed');
  }catch(e){
   if(scanId===latestScan.current){
    console.warn('Receipt OCR unavailable',e instanceof Error?e.message:'unknown');
    setOcrStatus('failed');
   }
  }finally{if(worker)await worker.terminate().catch(()=>{});}
 }
 function chooseFile(selected:File|null){
  latestScan.current+=1;
  const id=latestScan.current;
  setFile(selected);setError('');setOcrText('');setOcrConfidence(null);
  setDetectedSupplier('');setDetectedReceiptNumber('');setVatLines([]);
  setOcrStatus('idle');
  if(!selected)return;
  const photo=isImage(selected);
  setReceiptMode(photo);
  if(photo){setDate('');setAmount('');setNumber('');void analyzePhoto(selected,id);}
 }
 async function save(){
  if(busy||!file||ocrStatus==='reading')return;
  setError('');setNotice('');setBusy(true);
  try{
   if(file.size>MAX_BYTES||file.size<10)throw new Error('Kies een bestand kleiner dan 15 MB.');
   if(!isImage(file)&&!isPdf(file))throw new Error('Gebruik een PDF, JPG of PNG.');
   if(!supplierId||!amount.trim()||!Number.isFinite(Number(amount)))
    throw new Error('Selecteer een leverancier en controleer het totaalbedrag.');
   if(receiptMode&&!date)throw new Error('Vul de datum van de kassabon in.');
   const invoiceNumber=number.trim()||(receiptMode?await receiptId(file):'');
   if(!invoiceNumber)throw new Error('Vul het factuurnummer in, of vink kassabon aan.');
   const pdf=await pdfForUpload(file);
   const header=await pdf.slice(0,5).text();
   if(header!=='%PDF-')throw new Error('Het PDF-bestand is niet geldig.');
   const prepared=await request('prepare');
   if(!prepared.path||!prepared.token||!prepared.uploadId)throw new Error('Upload kon niet worden voorbereid.');
   const supabase=createClient();
   const uploaded=await supabase.storage.from('incoming-invoices')
    .uploadToSignedUrl(prepared.path,prepared.token,pdf,{contentType:'application/pdf'});
   if(uploaded.error)throw new Error('Uploaden is mislukt: '+uploaded.error.message);
   const payload={
    uploadId:prepared.uploadId,supplierId,costCategory:category,
    invoiceNumber,invoiceDate:date,totalAmount:Number(amount),projectNumber:project.trim(),
    sourceType:receiptMode?'receipt':'invoice',ocrText:receiptMode?ocrText:''
   };
   let result:ApiResult;
   try{result=await request('save',payload);}
   catch(e){
    const err=e as ApiError;
    if(err.code!=='POSSIBLE_DUPLICATE'||!window.confirm(err.message+'\n\nWeet je zeker dat dit een andere bon is?'))throw err;
    result=await request('save',{...payload,allowSimilarReceipt:true});
   }
   setNotice(result.message||'Bon of factuur toegevoegd.');
   setOpen(false);setSupplierId('');setCategory('overig');setNumber('');
   setDate('');setAmount('');setProject('');setFile(null);setReceiptMode(false);
   setOcrText('');setOcrStatus('idle');setVatLines([]);
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Opslaan is mislukt.');}
  finally{setBusy(false);}
 }
 return <div className="invoiceManualAdd">
  {notice&&<p className="invoiceProcessMessage success" role="status">{notice}</p>}
  {error&&<p className="invoiceProcessMessage error" role="alert">{error}</p>}
  {!open?<button type="button" className="button secondary" onClick={()=>setOpen(true)}>+ Handmatige factuur / bon</button>:
   <div className="invoiceSupplierAddForm">
    <strong>Factuur of kassabon toevoegen</strong>
    <p className="invoiceManualHint">Upload de originele PDF of een foto van de bon. Bij JPG en PNG vullen we herkenbare gegevens alvast in. Controleer ze voor het opslaan.</p>
    <div className="invoiceSupplierFields">
     <label>PDF of foto (JPG/PNG, max. 15 MB)
      <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy}
       onChange={e=>chooseFile(e.target.files?.[0]||null)}/></label>
     <label>Type document
      <span className="invoiceManualReceiptSwitch"><input type="checkbox" checked={receiptMode} disabled={busy}
       onChange={e=>setReceiptMode(e.target.checked)}/> Kassabon zonder factuurnummer</span></label>
     <label>Leverancier<select className="select" value={supplierId} disabled={busy} onChange={e=>{
      const id=e.target.value;setSupplierId(id);
      setCategory(suppliers.find(s=>s.id===id)?.default_cost_category||'overig');
     }}>
      <option value="">Kies leverancier</option>
      {suppliers.map(s=><option key={s.id} value={s.id}>{s.company_name}</option>)}
     </select></label>
     <label>Kostensoort<select className="select" value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>
      {INVOICE_SUPPLIER_CATEGORIES.map(key=><option key={key} value={key}>{INVOICE_COST_CATEGORY_LABELS[key]}</option>)}
     </select></label>
     <label>{receiptMode?'Bonreferentie (optioneel)':'Factuurnummer'}
      <input className="input" maxLength={64} value={number} disabled={busy}
       placeholder={receiptMode?'Automatisch bon-ID bij opslaan':'Bijv. F2026-134'} onChange={e=>setNumber(e.target.value)}/></label>
     <label>{receiptMode?'Datum kassabon':'Factuurdatum'}
      <input className="input" type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
     <label>Totaalbedrag incl. btw (€)
      <input className="input" type="number" min="0" max="99999999" step="0.01" value={amount} disabled={busy}
       onChange={e=>setAmount(e.target.value)}/></label>
     <label>Rentman-projectnummer (optioneel)
      <input className="input" placeholder="Bijv. 11065" value={project} disabled={busy}
       onChange={e=>setProject(e.target.value)}/></label>
    </div>
    {ocrStatus!=='idle'&&<p className="invoiceManualOcrStatus" role="status">
     {ocrStatus==='reading'?'Foto wordt uitgelezen… Dit kan bij de eerste keer iets langer duren.':
      ocrStatus==='failed'?'De foto kon niet automatisch worden uitgelezen. Vul de velden handmatig in.':
      'Foto uitgelezen'+(ocrConfidence!==null?' (herkenningszekerheid '+ocrConfidence+'%)':'')+
       '. Controleer winkel, datum, bedrag en het originele bonnetje.'}
    </p>}
    {ocrStatus==='ready'&&<div className="invoiceManualOcrSummary">
      {detectedSupplier&&<span>Herkenning: {detectedSupplier}{!supplierId?' · Kies of voeg de leverancier hierboven toe':''}</span>}
      {detectedReceiptNumber&&<span>Bonnummer op foto: {detectedReceiptNumber}</span>}
      {vatLines.length>0&&<small>BTW-regels gevonden. Controleer de originele bon voor de juiste btw-verdeling.</small>}
     </div>}
    {receiptMode&&<p className="invoiceManualHint">Zonder bonreferentie gebruiken we een unieke foto-ID. Bij een vergelijkbare aankoop op dezelfde datum waarschuwt het systeem voor mogelijke dubbele invoer.</p>}
    <div className="invoiceSupplierActions">
     <button className="button orange" type="button" disabled={busy||ocrStatus==='reading'||!file||!supplierId||(!receiptMode&&!number.trim())||!amount.trim()||receiptMode&&!date}
      onClick={()=>void save()}>{busy?'Opslaan…':ocrStatus==='reading'?'Foto uitlezen…':'Toevoegen aan controle'}</button>
     <button className="button secondary" type="button" disabled={busy} onClick={()=>{latestScan.current++;setOpen(false);setError('');}}>Annuleren</button>
    </div>
   </div>}
 </div>;
}
