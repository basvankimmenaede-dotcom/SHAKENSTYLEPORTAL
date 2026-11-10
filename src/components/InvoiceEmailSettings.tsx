'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {LockKeyhole,Mail,RefreshCw,ShieldCheck} from 'lucide-react';
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

  function saveAddress(data:FormData){
    startTransition(async()=>{const result=await updateIncomingInvoiceEmail(data);showToast(result.message,result.ok?'success':'error');});
  }
  async function submit(action:'save'|'test'|'toggle'|'sync',enabled?:boolean){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/invoice-imap',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,host,port,username,password,...(enabled===undefined?{}:{enabled})})
      });
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Actie mislukt.');
      if(result.status)setS(result.status);
      if(action==='save')setPassword('');
      setNotice(result.message||'Opgeslagen.');
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'Er is iets misgegaan.');}
    finally{setBusy(false);}
  }

  return <div className="invoiceMailSettings">
    <section className="settingsPanel invoiceMailPanel" aria-labelledby="invoiceAddressTitle">
      <header className="invoiceMailPanelHead">
        <div className="invoiceMailHeadingIcon"><Mail size={20}/></div>
        <div><div className="invoiceMailEyebrow">Facturatie</div><h2 id="invoiceAddressTitle">Ontvangstadres</h2><p>Het e-mailadres waar bartenders en leveranciers hun factuur naartoe sturen.</p></div>
      </header>
      <form action={saveAddress} className="invoiceMailAddressForm">
        <label className="invoiceMailField" htmlFor="invoice_email">
          <span>Factuur e-mailadres</span>
          <input id="invoice_email" name="incoming_invoice_email" className="input" type="email" maxLength={254} value={address} onChange={e=>setAddress(e.target.value)} placeholder="facturen@shakenstyle.com"/>
        </label>
        <button type="submit" className="button orange" disabled={pending}>{pending?'Opslaan…':'Opslaan'}</button>
      </form>
    </section>

    <section className="settingsPanel invoiceMailPanel" aria-labelledby="imapConnectionTitle">
      <header className="invoiceMailPanelHead">
        <div className="invoiceMailHeadingIcon"><LockKeyhole size={20}/></div>
        <div className="invoiceMailHeadingText"><div className="invoiceMailEyebrow">Mailserver</div><h2 id="imapConnectionTitle">IMAP-verbinding</h2><p>Beveiligde verbinding om facturen op te halen bij Antagonist.</p></div>
        <span className={'invoiceMailStatus '+(tested?'connected':changed?'unsaved':'disconnected')}>{changed?'Niet opgeslagen':tested?'Verbinding getest':'Niet verbonden'}</span>
      </header>
      <div className="invoiceMailBody">
        <div className="invoiceMailFields">
          <label className="invoiceMailField" htmlFor="imap_server"><span>IMAP-server</span>
            <input id="imap_server" className="input" value={host} onChange={e=>setHost(e.target.value)} autoComplete="off"/>
          </label>
          <label className="invoiceMailField" htmlFor="imap_port"><span>Poort</span>
            <input id="imap_port" className="input" type="number" min={1} max={65535} value={port} onChange={e=>setPort(Number(e.target.value))}/>
          </label>
          <label className="invoiceMailField" htmlFor="imap_user"><span>Gebruikersnaam</span>
            <input id="imap_user" className="input" type="email" autoComplete="off" placeholder="facturen@shakenstyle.com" value={username} onChange={e=>setUsername(e.target.value)}/>
          </label>
          <label className="invoiceMailField" htmlFor="imap_pass"><span>Wachtwoord</span>
            <input id="imap_pass" className="input" type="password" autoComplete="new-password" value={password} placeholder={s.hasPassword?'Opgeslagen — leeg laten om te behouden':'Mailboxwachtwoord'} onChange={e=>setPassword(e.target.value)}/>
          </label>
        </div>
        <p className="invoiceMailSecureNote"><ShieldCheck size={16}/> SSL/TLS is verplicht. Het wachtwoord wordt versleuteld opgeslagen en is hier niet terug te lezen.</p>
        <div className="invoiceMailActions">
          <button type="button" className="button orange" disabled={busy||!host||!username||(!s.hasPassword&&!password)} onClick={()=>submit('save')}>{busy?'Bezig…':'IMAP opslaan'}</button>
          <button type="button" className="button secondary" disabled={busy||changed||!s.hasPassword} onClick={()=>submit('test')}>Verbinding testen</button>
        </div>
        {(notice||error||s.lastError)&&<div role={error||s.lastError?'alert':'status'} className={'invoiceMailMessage '+(error||s.lastError?'error':'success')}>{error||s.lastError||notice}</div>}
      </div>
    </section>

    <section className="settingsPanel invoiceMailPanel" aria-labelledby="imapSyncTitle">
      <header className="invoiceMailPanelHead">
        <div className="invoiceMailHeadingIcon"><RefreshCw size={20}/></div>
        <div><div className="invoiceMailEyebrow">Verwerking</div><h2 id="imapSyncTitle">Synchronisatie</h2><p>Stel in wanneer nieuwe facturen worden opgehaald.</p></div>
      </header>
      <div className="invoiceMailBody invoiceMailSyncBody">
        <label className="invoiceMailSwitchRow">
          <div><strong>Automatisch ophalen</strong><span>Dagelijks om 06:00 UTC. Je kunt ook altijd handmatig synchroniseren.</span></div>
          <input type="checkbox" checked={s.enabled} disabled={busy||!tested} onChange={e=>submit('toggle',e.target.checked)}/>
        </label>
        <div className="invoiceMailSyncFooter">
          <div><strong>Laatste controle</strong><span>{format(s.lastSyncAt)}</span>{s.lastSyncResult&&<small>{s.lastSyncResult}</small>}</div>
          <button type="button" className="button secondary" disabled={busy||!tested} onClick={()=>submit('sync')}><RefreshCw size={15}/> Nu synchroniseren</button>
        </div>
      </div>
    </section>
  </div>;
}
