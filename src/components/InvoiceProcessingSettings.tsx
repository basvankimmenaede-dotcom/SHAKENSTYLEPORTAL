'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {BrainCircuit,CheckCheck,MailCheck,ShieldCheck,ExternalLink} from 'lucide-react';

type Settings={
 approverOne:string;approverTwo:string;forwardEmail:string;
 googleProjectId:string;googleProcessorId:string;googleLocation:'eu'|'us';
 googleHasKey:boolean;googleTestedAt:string|null;googleTestMessage:string|null;
};
type Account={id:string;full_name:string};
export default function InvoiceProcessingSettings({initial,accounts}:{initial:Settings;accounts:Account[]}){
 const [settings,setSettings]=useState(initial);
 const [serviceAccount,setServiceAccount]=useState('');
 const [busy,setBusy]=useState<'save'|'test'|null>(null);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [dirty,setDirty]=useState(false);
 const router=useRouter();
 const set=<K extends keyof Settings,>(key:K,value:Settings[K])=>{
  setSettings(s=>({...s,[key]:value}));setDirty(true);setError('');setNotice('');
 };
 async function request(action:'save'|'test'){
  if(busy)return;
  setBusy(action);setNotice('');setError('');
  try{
   const response=await fetch('/api/admin/invoice-processing',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({action,...settings,googleServiceAccountJson:action==='save'?serviceAccount:''})
   });
   const contentType=response.headers.get('content-type')||'';
   const result=contentType.includes('application/json')?await response.json():{error:'De server gaf geen geldig antwoord. Vernieuw de pagina.'};
   if(!response.ok)throw new Error(result.error||'Opslaan is mislukt.');
   setSettings(result.settings);setDirty(false);setServiceAccount('');setNotice(result.message);
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Deze actie is mislukt.');}
  finally{setBusy(null);}
 }
 const canTest=settings.googleHasKey&&settings.googleProjectId&&settings.googleProcessorId&&!dirty;
 const configured=Boolean(settings.approverOne&&settings.approverTwo&&settings.approverOne!==settings.approverTwo&&settings.forwardEmail);
 return <div className="invoiceProcessSettings">
  <section className="settingsPanel invoiceProcessPanel">
   <header className="invoiceProcessHeader"><div className="invoiceProcessIcon"><CheckCheck size={21}/></div><div>
    <span className="invoiceProcessEyebrow">Goedkeuring</span><h2>Twee goedkeurders</h2>
    <p>Alleen deze twee accounts kunnen de factuur goedkeuren. Eén persoon kan nooit beide akkoorden geven.</p>
   </div></header>
   <div className="invoiceProcessBody">
    <div className="invoiceProcessGrid">
     <label><span>Goedkeurder 1</span><select className="select" value={settings.approverOne} onChange={e=>set('approverOne',e.target.value)}>
      <option value="">Selecteer account</option>{accounts.map(a=><option key={a.id} value={a.id} disabled={a.id===settings.approverTwo}>{a.full_name}</option>)}
     </select></label>
     <label><span>Goedkeurder 2</span><select className="select" value={settings.approverTwo} onChange={e=>set('approverTwo',e.target.value)}>
      <option value="">Selecteer account</option>{accounts.map(a=><option key={a.id} value={a.id} disabled={a.id===settings.approverOne}>{a.full_name}</option>)}
     </select></label>
    </div>
    <p className="invoiceProcessNote"><ShieldCheck size={16}/> Accounts zonder facturatiebeheer zijn niet selecteerbaar. Een akkoord is persoonlijk en wordt met datum en tijd vastgelegd.</p>
   </div>
  </section>
  <section className="settingsPanel invoiceProcessPanel">
   <header className="invoiceProcessHeader"><div className="invoiceProcessIcon"><MailCheck size={21}/></div><div>
    <span className="invoiceProcessEyebrow">Boekhouding</span><h2>Doorstuuradres</h2>
    <p>Na twee goedkeuringen wordt de originele PDF automatisch doorgestuurd.</p>
   </div></header>
   <div className="invoiceProcessBody">
    <label className="invoiceProcessWide"><span>Doorsturen naar</span><input type="email" className="input" value={settings.forwardEmail}
      onChange={e=>set('forwardEmail',e.target.value)} placeholder="boekhouding@voorbeeld.nl" autoComplete="off"/></label>
    <p className="invoiceProcessNote">Dit gebruikt de bestaande SHAKENSTYLE SMTP-verbinding. De factuur krijgt pas de status Goedgekeurd als het doorsturen is bevestigd.</p>
   </div>
  </section>
  <section className="settingsPanel invoiceProcessPanel">
   <header className="invoiceProcessHeader"><div className="invoiceProcessIcon"><BrainCircuit size={21}/></div><div>
    <span className="invoiceProcessEyebrow">Automatisch uitlezen</span><h2>Google Document AI</h2>
    <p>Gebruik de Google Cloud Invoice Parser voor het herkennen van factuurnummer, datum, bedragen en leverancier.</p>
   </div><span className={'invoiceProcessPill '+(settings.googleTestedAt&&!dirty?'connected':'')}>{settings.googleTestedAt&&!dirty?'Verbonden':'Nog niet verbonden'}</span></header>
   <div className="invoiceProcessBody">
    <div className="invoiceProcessGrid">
     <label><span>Google Cloud project-ID</span><input className="input" value={settings.googleProjectId} onChange={e=>set('googleProjectId',e.target.value)} placeholder="mijn-google-project"/></label>
     <label><span>Document AI processor-ID</span><input className="input" value={settings.googleProcessorId} onChange={e=>set('googleProcessorId',e.target.value)} placeholder="ID van Invoice Parser"/></label>
     <label><span>Regio</span><select className="select" value={settings.googleLocation} onChange={e=>set('googleLocation',e.target.value as 'eu'|'us')}>
      <option value="eu">Europa (EU)</option><option value="us">Verenigde Staten (US)</option>
     </select></label>
     <div className="invoiceProcessReadOnly"><strong>Serviceaccount</strong><span>{settings.googleHasKey?'Sleutel veilig opgeslagen':'Nog geen sleutel opgeslagen'}</span></div>
    </div>
    <label className="invoiceProcessWide"><span>Serviceaccount JSON-sleutel</span>
     <textarea className="input" rows={4} autoComplete="off" spellCheck={false} value={serviceAccount}
      onChange={e=>{setServiceAccount(e.target.value);setDirty(true);}}
      placeholder={settings.googleHasKey?'Al ingesteld — leeg laten om te behouden':'Plak de JSON-inhoud van je Google Cloud serviceaccount'}/>
    </label>
    <p className="invoiceProcessNote"><ShieldCheck size={16}/> De sleutel wordt versleuteld opgeslagen en nooit teruggestuurd naar je browser. Facturen worden pas met Google verwerkt na een geslaagde verbindingstest.</p>
    <div className="invoiceProcessActions">
     <button className="button secondary" type="button" onClick={()=>request('test')} disabled={Boolean(busy)||!canTest}>{busy==='test'?'Testen…':'Google-verbinding testen'}</button>
     <a href="https://console.cloud.google.com/ai/document-ai/processors" target="_blank" rel="noopener noreferrer" className="invoiceProcessHelp">Google Cloud processors <ExternalLink size={14}/></a>
    </div>
    {settings.googleTestedAt&&!dirty&&<p className="invoiceProcessOkay">Getest: {new Date(settings.googleTestedAt).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'})} · {settings.googleTestMessage||'Invoice Parser'}</p>}
   </div>
  </section>
  <div className="invoiceProcessBottom">
   <div><strong>{configured?'Goedkeurders en doorstuuradres ingevuld':'Goedkeurders en doorstuuradres nog niet volledig ingesteld'}</strong>
    <span>Opgeslagen instellingen worden gebruikt bij nieuwe goedkeuringen.</span></div>
   <button type="button" className="button orange" disabled={Boolean(busy)||!dirty||
    Boolean(settings.approverOne&&settings.approverOne===settings.approverTwo)}
    onClick={()=>request('save')}>{busy==='save'?'Opslaan…':'Instellingen opslaan'}</button>
  </div>
  {notice&&<p role="status" className="invoiceProcessMessage success">{notice}</p>}
  {error&&<p role="alert" className="invoiceProcessMessage error">{error}</p>}
 </div>;
}
