'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {INVOICE_SUPPLIER_CATEGORIES,INVOICE_COST_CATEGORY_LABELS,type InvoiceSupplier} from '@/lib/invoice-suppliers';

type Props={suppliers:InvoiceSupplier[];canManage:boolean};
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
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  if(!notice)return;
  const timer=window.setTimeout(()=>setNotice(''),5000);
  return ()=>window.clearTimeout(timer);
 },[notice]);
 if(!canManage)return null;
 async function request(action:string,payload:Record<string,unknown>={}){
  const response=await fetch('/api/crew/admin/invoice-manual',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})
  });
  const result=await response.json().catch(()=>({error:'De server gaf geen geldig antwoord.'}));
  if(!response.ok)throw new Error(result.error||'Verwerken is mislukt.');
  return result;
 }
 async function save(){
  if(busy||!file)return;
  setError('');setNotice('');setBusy(true);
  try{
   if(file.size>15*1024*1024||file.size<10)throw new Error('Kies een PDF kleiner dan 15 MB.');
   const header=await file.slice(0,5).text();
   if(header!=='%PDF-')throw new Error('Selecteer een geldige PDF-factuur.');
   if(!supplierId||!number.trim()||!amount.trim()||!Number.isFinite(Number(amount)))
    throw new Error('Vul de verplichte velden in.');
   const prepared=await request('prepare');
   const supabase=createClient();
   const uploaded=await supabase.storage.from('incoming-invoices')
    .uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:'application/pdf'});
   if(uploaded.error)throw new Error('PDF uploaden is mislukt: '+uploaded.error.message);
   const result=await request('save',{
    uploadId:prepared.uploadId,supplierId,costCategory:category,
    invoiceNumber:number.trim(),invoiceDate:date,totalAmount:Number(amount),projectNumber:project.trim()
   });
   setNotice(result.message||'Factuur toegevoegd.');
   setOpen(false);setNumber('');setDate('');setAmount('');setProject('');setFile(null);setSupplierId('');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Opslaan is mislukt.');}
  finally{setBusy(false);}
 }
 return <div className="invoiceManualAdd">
  {notice&&<p className="invoiceProcessMessage success" role="status">{notice}</p>}
  {error&&<p className="invoiceProcessMessage error" role="alert">{error}</p>}
  {!open?<button type="button" className="button secondary" onClick={()=>setOpen(true)}>+ Handmatige factuur</button>:
   <div className="invoiceSupplierAddForm">
    <strong>Handmatige leveranciersfactuur</strong>
    <p className="invoiceManualHint">Voeg een factuur toe die niet via de mailbox binnenkwam. Deze gaat langs dezelfde dubbele goedkeuring.</p>
    <div className="invoiceSupplierFields">
     <label>Leverancier<select className="select" value={supplierId} onChange={e=>{
      const id=e.target.value;setSupplierId(id);
      setCategory(suppliers.find(s=>s.id===id)?.default_cost_category||'overig');
     }}>
      <option value="">Kies leverancier</option>
      {suppliers.map(s=><option key={s.id} value={s.id}>{s.company_name}</option>)}
     </select></label>
     <label>Kostensoort<select className="select" value={category} onChange={e=>setCategory(e.target.value)}>
      {INVOICE_SUPPLIER_CATEGORIES.map(key=><option key={key} value={key}>{INVOICE_COST_CATEGORY_LABELS[key]}</option>)}
     </select></label>
     <label>Factuurnummer<input className="input" maxLength={64} value={number} onChange={e=>setNumber(e.target.value)}/></label>
     <label>Factuurdatum<input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>Totaalbedrag (€)<input className="input" type="number" min="0" max="99999999" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label>Rentman-projectnummer (optioneel)<input className="input" placeholder="Bijv. 11065" value={project} onChange={e=>setProject(e.target.value)}/></label>
     <label>Originele PDF (maximaal 15 MB)<input className="input" type="file" accept="application/pdf,.pdf"
      onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    </div>
    <div className="invoiceSupplierActions">
     <button className="button orange" type="button" disabled={busy||!file||!supplierId||!number.trim()||!amount.trim()} onClick={()=>void save()}>
      {busy?'Opslaan…':'Factuur toevoegen'}</button>
     <button className="button secondary" type="button" disabled={busy} onClick={()=>{setOpen(false);setError('');}}>Annuleren</button>
    </div>
   </div>}
 </div>;
}
