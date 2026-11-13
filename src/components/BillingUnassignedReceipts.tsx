
'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';

type Receipt={id:string;merchant:string|null;cost_amount:number|null;document_date:string|null;
 message_id:string;attachment_index:number;project_number:string|null};
type Project={id:string;project_name:string;rentman_project_number:string|null;status:string};
export default function BillingUnassignedReceipts({receipts,projects,canManage}:{receipts:Receipt[];projects:Project[];canManage:boolean}){
 const [chosen,setChosen]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const router=useRouter();
 if(!receipts.length)return null;
 async function assign(receiptId:string){
  const billingItemId=chosen[receiptId]||'';
  if(!billingItemId||busy)return;
  setBusy(receiptId);setError('');
  try{
   const r=await fetch('/api/planning/billing/receipt-costs/assign',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({receiptId,billingItemId})});
   const result=await r.json();
   if(!r.ok)throw new Error(result.error||'Koppelen mislukt.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Koppelen mislukt.');}
  finally{setBusy(null);}
 }
 return <section className="card" style={{padding:18,marginBottom:16}}>
  <h2 style={{margin:'0 0 5px'}}>Bonnetjes nog toe te wijzen ({receipts.length})</h2>
  <p style={{fontSize:12,color:'var(--muted)'}}>Deze bonnetjes zijn ontvangen, maar horen nog niet bij een bekend facturatieproject. Kies het juiste project; de doorbelasting blijft daarna een aparte handmatige keuze.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {receipts.map(row=><div key={row.id} style={{display:'flex',gap:12,justifyContent:'space-between',alignItems:'end',flexWrap:'wrap',borderTop:'1px solid var(--border,#ddd)',padding:'10px 0'}}>
   <div><strong>{row.merchant||'Bonnetje'}</strong><div style={{fontSize:12,color:'var(--muted)'}}>{row.document_date||'Geen datum'} · {row.cost_amount===null?'Bedrag onbekend':Number(row.cost_amount).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})} {row.project_number?'· voorgesteld #'+row.project_number:''}</div>
    <Link href={'/planning/crew-invoices?view=archive'} style={{fontSize:12}}>Inkomende administratie</Link>
   </div>
   {canManage&&<div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}}>
    <label style={{fontSize:11}}>Koppel aan project<select className="select" aria-label={'Project voor bonnetje '+row.id} value={chosen[row.id]||''} onChange={e=>setChosen(x=>({...x,[row.id]:e.target.value}))}>
     <option value="">Kies project</option>{projects.filter(p=>p.status==='open'&&p.rentman_project_number).map(p=><option value={p.id} key={p.id}>#{p.rentman_project_number} · {p.project_name}</option>)}
    </select></label>
    <button className="button orange" type="button" disabled={Boolean(busy)||!chosen[row.id]} onClick={()=>void assign(row.id)}>Koppelen</button>
   </div>}
  </div>)}
 </section>;
}
