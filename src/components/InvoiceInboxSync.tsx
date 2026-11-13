
'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {RefreshCw} from 'lucide-react';

/** Manual invoice-mailbox synchronization from the overview. No IMAP configuration is exposed here. */
export default function InvoiceInboxSync({canSync,tested,lastSyncAt,lastSyncResult}:{
 canSync:boolean;tested:boolean;lastSyncAt:string|null;lastSyncResult:string|null;
}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!notice)return;
  const timer=window.setTimeout(()=>setNotice(''),7000);
  return ()=>window.clearTimeout(timer);
 },[notice]);
 if(!canSync)return null;
 const formatted=lastSyncAt?new Date(lastSyncAt).toLocaleString('nl-NL',{
  timeZone:'Europe/Amsterdam',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'
 }):'Nog niet gesynchroniseerd';
 async function sync(){
  if(busy||!tested)return;
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/crew/admin/invoice-sync',{
    method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
   });
   const body=await response.json().catch(()=>({error:'Onverwacht antwoord van de server.'}));
   if(!response.ok)throw new Error(body.error||'Synchronisatie mislukt.');
   setNotice(body.message||'Synchronisatie afgerond.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Synchronisatie mislukt.');}
  finally{setBusy(false);}
 }
 return <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:5,maxWidth:390}}>
  <button type="button" className="button secondary" disabled={!tested||busy}
   onClick={()=>void sync()} aria-busy={busy}>
   <RefreshCw size={16}/> {busy?'E-mails ophalen…':'Nu synchroniseren'}
  </button>
  <small style={{fontSize:11,opacity:.83}}>Laatste controle: {formatted}</small>
  {!tested&&<small style={{fontSize:11}}>Test eerst de IMAP-verbinding bij Instellingen.</small>}
  {error&&<small role="alert" style={{color:'var(--danger,#b91c1c)'}}>{error}</small>}
  {notice&&<small role="status">{notice}</small>}
  {!notice&&!error&&lastSyncResult&&<small style={{fontSize:11,opacity:.75}}>{lastSyncResult}</small>}
 </div>;
}
