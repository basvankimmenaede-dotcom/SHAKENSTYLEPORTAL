
'use client';
import {useEffect,useRef,useState} from 'react';

export type ReceiptCharge={id:string;merchant:string|null;filename:string;cost_amount:number|null;
 sale_description:string|null;sale_price:number|null;sale_vat_rate:number|null;
 message_id:string;attachment_index:number;billing_status:string};
type Receipt=ReceiptCharge&{project_number:string|null;document_date:string|null;
 linked_invoice_id:string|null;note:string|null;billing_item_id:string|null;};
type Entry={description:string;price:string;vatRate:string};
const eur=(n:number)=>n.toLocaleString('nl-NL',{style:'currency',currency:'EUR'});
export default function BillingReceiptReview({id,canManage,onChange}:{id:string;canManage:boolean;
 onChange:(charges:ReceiptCharge[])=>void;}){
 const [rows,setRows]=useState<Receipt[]>([]);
 const [fields,setFields]=useState<Record<string,Entry>>({});
 const [pending,setPending]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const onChangeRef=useRef(onChange);
 useEffect(()=>{onChangeRef.current=onChange;});
 async function refresh(){
  const response=await fetch('/api/planning/billing/receipt-costs/'+encodeURIComponent(id),{cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Bonnetjes laden mislukt.');
  const next=(result.receipts||[]) as Receipt[];
  setRows(next);
  setFields(current=>{
   const updates={...current};
   for(const row of next){
    if(!updates[row.id])updates[row.id]={
     description:row.sale_description||'Doorbelasting '+(row.merchant||row.filename),
     price:row.sale_price==null?'':String(row.sale_price),
     vatRate:String(row.sale_vat_rate??21)
    };
   }
   return updates;
  });
  onChangeRef.current(next.filter(row=>row.billing_status==='included'));
 }
 useEffect(()=>{
  let alive=true;
  fetch('/api/planning/billing/receipt-costs/'+encodeURIComponent(id),{cache:'no-store'})
   .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Laden mislukt.');return j})
   .then(j=>{
    if(!alive)return;
    const next=(j.receipts||[]) as Receipt[];
    setRows(next);
    setFields(Object.fromEntries(next.map(row=>[row.id,{
     description:row.sale_description||'Doorbelasting '+(row.merchant||row.filename),
     price:row.sale_price==null?'':String(row.sale_price),vatRate:String(row.sale_vat_rate??21)
    }])));
    onChangeRef.current(next.filter(row=>row.billing_status==='included'));
   }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Laden mislukt.');});
  return()=>{alive=false;};
 },[id]);
 const update=(id:string,key:keyof Entry,value:string)=>setFields(current=>({
  ...current,[id]:{...(current[id]||{description:'',price:'',vatRate:'21'}),[key]:value}
 }));
 async function decide(receipt:Receipt,action:string){
  if(pending)return;
  setPending(receipt.id);setError('');setMessage('');
  const form=fields[receipt.id]||{description:'',price:'',vatRate:'21'};
  try{
   const resp=await fetch('/api/planning/billing/receipt-costs/'+encodeURIComponent(id),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({receiptId:receipt.id,action,description:form.description,
     unitPrice:form.price,vatRate:Number(form.vatRate)})
   });
   const result=await resp.json();
   if(!resp.ok)throw new Error(result.error||'Bonnetje verwerken mislukt.');
   setMessage(result.message||'Opgeslagen.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Opslaan mislukt.');}
  finally{setPending(null);}
 }
 const open=rows.filter(row=>row.billing_status==='pending');
 const included=rows.filter(row=>row.billing_status==='included');
 const other=rows.filter(row=>['not_bill','already_processed'].includes(row.billing_status));
 const subtotal=included.reduce((s,row)=>s+Number(row.sale_price||0),0);
 return <section className="card" style={{padding:18,marginBottom:14}} aria-label="Bonnetjes en doorbelasting">
  <h3 style={{margin:'0 0 5px'}}>Bonnetjes & mogelijke doorbelasting {open.length?'('+open.length+' te beoordelen)':''}</h3>
  <p style={{fontSize:12,color:'var(--muted)',margin:'0 0 12px'}}>Bonnetjes uit de inkomende mailbox. Alleen handmatig toegevoegde kosten tellen mee in de klantcalculatie. De verkoopprijs is excl. btw; het bonbedrag kan incl. btw zijn.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {message&&<p role="status" style={{fontSize:12}}>{message}</p>}
  {!rows.length&&!error&&<p className="muted">Nog geen bonnetjes aan dit project gekoppeld.</p>}
  {open.map(row=><div key={row.id} style={{border:'1px solid var(--border,#ddd)',borderRadius:8,padding:12,marginBottom:10}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
    <strong>{row.merchant||row.filename}</strong><strong>{row.cost_amount===null?'Bonbedrag onbekend':eur(Number(row.cost_amount))}</strong>
   </div>
   <div style={{fontSize:12,color:'var(--muted)',margin:'5px 0 8px'}}>{row.document_date||'Datum onbekend'} · <a target="_blank" rel="noopener noreferrer" href={'/api/crew/admin/invoice-messages/'+row.message_id+'/pdf/'+row.attachment_index}>Originele bon bekijken</a>{row.linked_invoice_id?' · Ook gekoppeld aan inkomende factuur':''}</div>
   {canManage&&<div style={{display:'grid',gridTemplateColumns:'minmax(150px,2fr) minmax(100px,1fr) 90px',gap:8,marginBottom:8}}>
    <label style={{fontSize:11}}>Omschrijving<input aria-label={'Omschrijving bonnetje '+row.id} className="input" value={fields[row.id]?.description||''} onChange={e=>update(row.id,'description',e.target.value)} /></label>
    <label style={{fontSize:11}}>Verkoopprijs excl. btw<input aria-label={'Prijs bonnetje '+row.id} className="input" type="number" min="0" step="0.01" placeholder="Zelf invullen" value={fields[row.id]?.price??''} onChange={e=>update(row.id,'price',e.target.value)} /></label>
    <label style={{fontSize:11}}>Btw<select className="select" aria-label={'Btw bonnetje '+row.id} value={fields[row.id]?.vatRate||'21'} onChange={e=>update(row.id,'vatRate',e.target.value)}><option value="21">21%</option><option value="9">9%</option><option value="0">0%</option></select></label>
   </div>}
   {canManage&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    <button type="button" className="button orange" disabled={Boolean(pending)||!fields[row.id]?.price?.trim()||!fields[row.id]?.description?.trim()} onClick={()=>void decide(row,'include')}>Toevoegen aan calculatie</button>
    <button type="button" className="button secondary" disabled={Boolean(pending)} onClick={()=>void decide(row,'not_bill')}>Niet doorbelasten</button>
    <button type="button" className="button secondary" disabled={Boolean(pending)} onClick={()=>void decide(row,'already_processed')}>Al verwerkt</button>
   </div>}
  </div>)}
  {included.map(row=><div key={row.id} style={{display:'flex',justifyContent:'space-between',gap:9,alignItems:'center',borderBottom:'1px solid var(--border,#ddd)',padding:'10px 0'}}>
   <div><strong>{row.sale_description||row.merchant||row.filename}</strong><div style={{fontSize:12,color:'var(--muted)'}}>Doorbelast · <a target="_blank" rel="noopener noreferrer" href={'/api/crew/admin/invoice-messages/'+row.message_id+'/pdf/'+row.attachment_index}>Origineel</a></div></div>
   <div style={{textAlign:'right'}}><strong>{eur(Number(row.sale_price||0))} excl.</strong>{canManage&&<div><button type="button" className="button secondary" disabled={Boolean(pending)} onClick={()=>void decide(row,'pending')}>Terugzetten</button></div>}</div>
  </div>)}
  {other.map(row=><div key={row.id} style={{display:'flex',justifyContent:'space-between',gap:9,alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border,#ddd)'}}>
   <span>{row.merchant||row.filename} · <small>{row.billing_status==='already_processed'?'Al verwerkt':'Niet doorbelasten'}</small></span>
   {canManage&&<button type="button" className="button secondary" disabled={Boolean(pending)} onClick={()=>void decide(row,'pending')}>Heropenen</button>}
  </div>)}
  {included.length>0&&<p style={{textAlign:'right',marginTop:12}}>Toegevoegd aan factuurconcept: <strong>{eur(subtotal)} excl. btw</strong></p>}
 </section>;
}
