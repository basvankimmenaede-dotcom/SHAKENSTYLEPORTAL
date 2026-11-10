'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {INVOICE_SUPPLIER_CATEGORIES,INVOICE_COST_CATEGORY_LABELS} from '@/lib/invoice-suppliers';
export default function InvoiceSupplierQuickAdd({canManage}:{canManage:boolean}){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [name,setName]=useState('');
 const [email,setEmail]=useState('');
 const [vat,setVat]=useState('');
 const [kvk,setKvk]=useState('');
 const [category,setCategory]=useState('overig');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 if(!canManage)return null;
 async function submit(){
  if(busy||name.trim().length<2)return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/crew/admin/invoice-suppliers',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({companyName:name,contactEmail:email,vatNumber:vat,kvkNumber:kvk,defaultCostCategory:category})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Opslaan mislukt.');
   setOpen(false);setName('');setEmail('');setVat('');setKvk('');setMessage(result.message||'Leverancier toegevoegd.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt.');}
  finally{setBusy(false);}
 }
 return <div className="invoiceSupplierAdd">
  {message&&<p className="invoiceProcessMessage success" role="status">{message}</p>}
  {error&&<p className="invoiceProcessMessage error" role="alert">{error}</p>}
  {!open?<button className="button secondary" type="button" onClick={()=>setOpen(true)}>+ Leverancier toevoegen</button>:
   <div className="invoiceSupplierAddForm">
    <strong>Nieuwe leverancier</strong>
    <div className="invoiceSupplierFields">
     <label>Bedrijfsnaam<input className="input" value={name} maxLength={160} onChange={e=>setName(e.target.value)} placeholder="Leverancier" /></label>
     <label>Factuur-/contactmail<input className="input" type="email" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)} placeholder="facturen@leverancier.nl" /></label>
     <label>BTW-nummer (optioneel)<input className="input" value={vat} maxLength={40} onChange={e=>setVat(e.target.value)} /></label>
     <label>KvK-nummer (optioneel)<input className="input" value={kvk} maxLength={40} onChange={e=>setKvk(e.target.value)} /></label>
     <label>Kostensoort<select className="select" value={category} onChange={e=>setCategory(e.target.value)}>{INVOICE_SUPPLIER_CATEGORIES.map(code=><option key={code} value={code}>{INVOICE_COST_CATEGORY_LABELS[code]}</option>)}</select></label>
    </div>
    <div className="invoiceSupplierActions">
     <button className="button orange" type="button" disabled={busy||name.trim().length<2} onClick={()=>void submit()}>{busy?'Opslaan…':'Leverancier opslaan'}</button>
     <button className="button secondary" type="button" disabled={busy} onClick={()=>{setOpen(false);setError('')}}>Annuleren</button>
    </div>
   </div>}
 </div>;
}
