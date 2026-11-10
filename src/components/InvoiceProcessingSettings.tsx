'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCheck,MailCheck,ShieldCheck,FileSearch,Clock3} from 'lucide-react';
type Settings={approverOne:string;approverTwo:string;forwardEmail:string};
type Account={id:string;full_name:string};
export default function InvoiceProcessingSettings({initial,accounts}:{initial:Settings;accounts:Account[]}){
 const [settings,setSettings]=useState(initial);
 const [busy,setBusy]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const router=useRouter();
 const set=<K extends keyof Settings>(key:K,value:Settings[K])=>{
  setSettings(s=>({...s,[key]:value}));setDirty(true);setError('');setNotice('');
 };
 async function save(){
  if(busy)return;
  setBusy(true);setNotice('');setError('');
  try{
   const response=await fetch('/api/admin/invoice-processing',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',...settings})
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Opslaan is mislukt.');
   setSettings(data.settings);setDirty(false);setNotice('Factuurinstellingen opgeslagen.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Deze actie is mislukt.');}
  finally{setBusy(false);}
 }
 const configured=Boolean(settings.approverOne&&settings.approverTwo&&settings.approverOne!==settings.approverTwo&&settings.forwardEmail);
 return <div className="invoiceProcessSettings">
  <section className="settingsPanel invoiceProcessPanel">
   <header className="invoiceProcessHeader"><div className="invoiceProcessIcon"><CheckCheck size={21}/></div><div>
    <span className="invoiceProcessEyebrow">Goedkeuring</span><h2>Twee goedkeurders</h2>
    <p>Alleen deze twee accounts kunnen een factuur goedkeuren. Eén persoon kan nooit beide akkoorden geven.</p>
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
    <p className="invoiceProcessNote"><ShieldCheck size={16}/> Akkoorden zijn persoonlijk en worden met datum en tijd vastgelegd.</p>
   </div>
  </section>
  <section className="settingsPanel invoiceProcessPanel">
   <header className="invoiceProcessHeader"><div className="invoiceProcessIcon"><MailCheck size={21}/></div><div>
    <span className="invoiceProcessEyebrow">Boekhouding</span><h2>Doorstuuradres</h2>
    <p>Na twee goedkeuringen wordt de originele PDF doorgestuurd.</p>
   </div></header>
   <div className="invoiceProcessBody">
    <label className="invoiceProcessWide"><span>Doorsturen naar</span><input type="email" className="input" value={settings.forwardEmail}
      onChange={e=>set('forwardEmail',e.target.value)} placeholder="boekhouding@voorbeeld.nl" autoComplete="off"/></label>
    <p className="invoiceProcessNote">Verzending gebruikt de bestaande SHAKENSTYLE SMTP-verbinding; de ontvangst in het boekhoudpakket is een aparte stap.</p>
   </div>
  </section>
  <section className="settingsPanel invoiceProcessPanel">
   <header className="invoiceProcessHeader"><div className="invoiceProcessIcon"><FileSearch size={21}/></div><div>
    <span className="invoiceProcessEyebrow">Eigen herkenning</span><h2>SHAKENSTYLE PDF-herkenning</h2>
    <p>Factuurnummer, datum, bedrag, projectnummers, uren en leverancier worden lokaal uit de PDF-tekst herkend. Geen Google Document AI.</p>
   </div><span className="invoiceProcessPill connected">In gebruik</span></header>
   <div className="invoiceProcessBody">
    <p className="invoiceProcessNote"><Clock3 size={16}/> Het systeem vergelijkt de opgegeven uren, reistijd en onkosten met de ingediende shiftrapporten. Bij ontbrekende of onduidelijke gegevens moet kantoor het origineel controleren.</p>
    <p className="invoiceProcessNote">Afgehandelde facturen staan in het doorzoekbare archief. Een gescande PDF zonder tekst vereist voorlopig handmatige invoer.</p>
   </div>
  </section>
  <div className="invoiceProcessBottom">
   <div><strong>{configured?'Goedkeurders en doorstuuradres ingevuld':'Goedkeurders en doorstuuradres nog niet volledig ingesteld'}</strong>
    <span>Wijzigingen gelden voor nieuwe goedkeuringen.</span></div>
   <button type="button" className="button orange" disabled={busy||!dirty||
     Boolean(settings.approverOne&&settings.approverOne===settings.approverTwo)}
    onClick={()=>void save()}>{busy?'Opslaan…':'Instellingen opslaan'}</button>
  </div>
  {notice&&<p role="status" className="invoiceProcessMessage success">{notice}</p>}
  {error&&<p role="alert" className="invoiceProcessMessage error">{error}</p>}
 </div>;
}
