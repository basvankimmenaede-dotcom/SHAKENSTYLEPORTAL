'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {updateIncomingInvoiceEmail} from '@/app/planning/actions';
import {useToast} from '@/components/ToastProvider';
type Status={host:string;port:number;username:string;hasPassword:boolean;enabled:boolean;testedAt:string|null;lastSyncAt:string|null;lastSyncResult:string|null;lastError:string|null};
export default function InvoiceEmailSettings({email,imap}:{email:string;imap:Status}){
 const [address,setAddress]=useState(email);
 const [s,setS]=useState(imap);
 const [host,setHost]=useState(imap.host);
 const [port,setPort]=useState(imap.port);
 const [username,setUsername]=useState(imap.username);
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [pending,startTransition]=useTransition();
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const {showToast}=useToast();
 const router=useRouter();
 const changed=host!==s.host||port!==s.port||username!==s.username||Boolean(password);
 const tested=Boolean(s.testedAt)&&!changed;
 const format=(d:string|null)=>d?new Date(d).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'}):'Nog niet';
 function saveAddress(data:FormData){startTransition(async()=>{const r=await updateIncomingInvoiceEmail(data);showToast(r.message,r.ok?'success':'error');});}
 async function submit(action:'save'|'test'|'toggle'|'sync',enabled?:boolean){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/admin/invoice-imap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,host,port,username,password,...(enabled===undefined?{}:{enabled})})});
   const r=await response.json();if(!response.ok)throw Error(r.error||'Actie mislukt.');
   if(r.status)setS(r.status);
   if(action==='save')setPassword('');
   setNotice(r.message||'Opgeslagen.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Er is iets misgegaan.');}finally{setBusy(false)}
 }
 return <div style={{display:'grid',gap:24}}>
  <form action={saveAddress} className="settingsFormRow">
   <div><strong>Ontvangstadres</strong><span>Het adres waar bartenders en leveranciers facturen naartoe sturen.</span></div>
   <div style={{flex:'1 1 280px',maxWidth:390}}><label className="sr-only" htmlFor="invoice_email">Factuur e-mailadres</label><input id="invoice_email" name="incoming_invoice_email" className="input" type="email" maxLength={254} style={{width:'100%'}} value={address} onChange={e=>setAddress(e.target.value)}/></div>
   <button type="submit" className="button orange" disabled={pending}>{pending?'Opslaan…':'Opslaan'}</button>
  </form>
  <div style={{borderTop:'1px solid var(--border,#ddd)',paddingTop:20,display:'grid',gap:12}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
    <div><strong>IMAP-verbinding</strong><div className="muted" style={{marginTop:4}}>Mail automatisch ophalen bij Antagonist.</div></div>
    <span className={'usersStatusBadge '+(tested?'active':'inactive')}>{changed?'Niet opgeslagen':tested?'Verbonden (getest)':'Niet verbonden'}</span>
   </div>
   <div className="field"><label htmlFor="imap_server">IMAP-server</label><input id="imap_server" className="input" value={host} onChange={e=>setHost(e.target.value)}/></div>
   <div className="field"><label htmlFor="imap_port">Poort</label><input id="imap_port" className="input" type="number" min={1} max={65535} value={port} onChange={e=>setPort(Number(e.target.value))}/></div>
   <div className="field"><label htmlFor="imap_user">Gebruikersnaam</label><input id="imap_user" className="input" type="email" autoComplete="off" placeholder="facturen@shakenstyle.com" value={username} onChange={e=>setUsername(e.target.value)}/></div>
   <div className="field"><label htmlFor="imap_pass">Wachtwoord</label><input id="imap_pass" className="input" type="password" autoComplete="new-password" value={password} placeholder={s.hasPassword?'Opgeslagen — leeg laten om te behouden':'Mailboxwachtwoord'} onChange={e=>setPassword(e.target.value)}/></div>
   <div className="muted">SSL/TLS is verplicht. Het wachtwoord wordt versleuteld opgeslagen en is hier nooit terug te lezen.</div>
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <button type="button" className="button orange" disabled={busy||!host||!username||(!s.hasPassword&&!password)} onClick={()=>submit('save')}>{busy?'Bezig…':'IMAP opslaan'}</button>
    <button type="button" className="button secondary" disabled={busy||changed||!s.hasPassword} onClick={()=>submit('test')}>Verbinding testen</button>
   </div>
   <div style={{borderTop:'1px solid var(--border,#ddd)',paddingTop:18,display:'grid',gap:12}}>
    <label style={{display:'flex',gap:10,alignItems:'center',fontWeight:650}}><input type="checkbox" checked={s.enabled} disabled={busy||!tested} onChange={e=>submit('toggle',e.target.checked)}/> Automatisch ophalen</label>
    <p className="muted" style={{margin:0}}>Als dit aan staat, controleert de portal dagelijks om 06:00 UTC de mailbox. Handmatig synchroniseren kan ook.</p>
    <div style={{display:'flex',gap:16,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
     <div><div><strong>Laatste controle:</strong> {format(s.lastSyncAt)}</div>{s.lastSyncResult&&<div className="muted">{s.lastSyncResult}</div>}</div>
     <button type="button" className="button secondary" disabled={busy||!tested} onClick={()=>submit('sync')}>Nu synchroniseren</button>
    </div>
   </div>
   {notice&&<div className="notice" role="status">{notice}</div>}
   {(error||s.lastError)&&<div role="alert" style={{color:'#b42318',fontSize:13}}>{error||s.lastError}</div>}
  </div>
 </div>;
}
