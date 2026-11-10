'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Invoice={id:string;invoice_number:string;name:string;total_amount:number|null;status:string;correction_reason:string|null;created_at:string};
export default function CrewInvoiceAdminList({invoices,canManage}:{invoices:Invoice[];canManage:boolean}){
  const [selected,setSelected]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const router=useRouter();
  const labels:Record<string,string>={received:'Ontvangen',in_review:'In behandeling',correction_sending:'Correctiemail controleren',correction_needed:'Correctie nodig',approved:'Goedgekeurd'};
  async function send(id:string){
    if(!canManage||saving||reason.trim().length<8)return;
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/crew/admin/invoices/'+encodeURIComponent(id)+'/request-correction',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:reason.trim()})
      });
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Verzenden mislukt');
      setSelected(null);setReason('');router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'Verzenden mislukt');}
    finally{setSaving(false)}
  }
  if(invoices.length===0)return <div className="notice">Nog geen facturen aan een bartender gekoppeld. Controleer hierboven de ontvangen PDF’s en koppel ze na beoordeling.</div>;
  return <div className="stack">{invoices.map(inv=><section key={inv.id} className="card" style={{padding:20,marginBottom:12}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <div><strong>{inv.name}</strong><div className="muted">{inv.invoice_number} · {inv.total_amount===null?'Bedrag onbekend':'€ '+Number(inv.total_amount).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
      <span className="muted">{labels[inv.status]||'In behandeling'}</span>
    </div>
    {inv.correction_reason&&<p className="muted">Toelichting: {inv.correction_reason}</p>}
    {canManage&&['received','in_review'].includes(inv.status)&&<div style={{marginTop:16}}>
      {selected===inv.id?<div style={{display:'grid',gap:10,maxWidth:580}}>
        <label htmlFor={'reason-'+inv.id}>Wat moet de bartender aanpassen?</label>
        <textarea id={'reason-'+inv.id} className="input" rows={3} maxLength={1500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Beschrijf het verschil met het shiftrapport en de gewenste correctie."/>
        {error&&<div className="error" role="alert">{error}</div>}
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <button type="button" className="button orange" disabled={saving||reason.trim().length<8} onClick={()=>send(inv.id)}>{saving?'Verzenden…':'Correctiemail versturen'}</button>
          <button type="button" className="button secondary" disabled={saving} onClick={()=>{setSelected(null);setReason('');setError('')}}>Annuleren</button>
        </div>
      </div>:<button type="button" className="button secondary" onClick={()=>{setSelected(inv.id);setReason('');setError('')}}>Correctie aanvragen</button>}
    </div>}
  </section>)}</div>;
}
