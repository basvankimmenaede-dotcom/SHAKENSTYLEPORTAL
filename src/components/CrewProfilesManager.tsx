'use client';
import {useMemo,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {saveCrewInvoiceIdentity} from '@/app/admin/crew-actions';
import {Search,Building2} from 'lucide-react';

type Member={
 id:string;rentman_crew_id:number;full_name:string;email:string|null;rentman_email:string|null;
 login_email_override:string|null;company_name:string|null;company_alias:string|null;
 invoice_email:string|null;active:boolean;portal_deleted:boolean;manual_disabled:boolean;last_synced_at:string|null;
};
function CrewEditor({member}:{member:Member}){
 const [saving,startSaving]=useTransition();
 const [message,setMessage]=useState<{ok:boolean;message:string}|null>(null);
 const router=useRouter();
 function onSubmit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  const data=new FormData(e.currentTarget);
  startSaving(async()=>{
   try{
    const result=await saveCrewInvoiceIdentity(data);
    setMessage(result);
    if(result.ok)router.refresh();
   }catch{setMessage({ok:false,message:'Opslaan mislukt. Probeer het opnieuw.'});}
  });
 }
 return <form onSubmit={onSubmit} className="crewProfileEditor">
  <input type="hidden" name="crew_member_id" value={member.id}/>
  <div className="crewProfileIntro">
   <span className="crewProfileAvatar">{member.full_name?.trim().slice(0,1).toUpperCase()||'C'}</span>
   <div><h2>{member.full_name}</h2><p>Rentman-medewerker #{member.rentman_crew_id}</p></div>
  </div>
  <div className="crewProfileStatusStrip">
   <span className={member.active?'good':'warn'}>Rentman: {member.active?'actief':'inactief'}</span>
   <span className={member.manual_disabled?'warn':'good'}>Handmatig geblokkeerd: {member.manual_disabled?'ja':'nee'}</span>
   <span>Laatste synchronisatie: {member.last_synced_at?new Date(member.last_synced_at).toLocaleDateString('nl-NL'):'onbekend'}</span>
  </div>
  <div className="crewProfileFields">
   <label><span>Bedrijfsnaam op de factuur</span>
    <input className="input" name="company_name" maxLength={160} defaultValue={member.company_name||''} placeholder="Bijvoorbeeld: SJ Events B.V."/>
   </label>
   <label><span>Handelsnaam (optioneel)</span>
    <input className="input" name="company_alias" maxLength={160} defaultValue={member.company_alias||''} placeholder="Alternatieve bedrijfsnaam"/>
   </label>
   <label><span>Factuur e-mailadres</span>
    <input className="input" name="invoice_email" type="email" maxLength={254} defaultValue={member.invoice_email||''} placeholder="facturen@bedrijf.nl"/>
   </label>
  </div>
  <div className="crewProfileReadOnly">
   <div><span>Rentman e-mailadres</span><strong>{member.rentman_email||member.email||'Niet ingesteld'}</strong></div>
   <div><span>Portal login e-mailadres</span><strong>{member.login_email_override||member.email||'Niet ingesteld'}</strong></div>
   <small>Deze bestaande adressen kunnen ook als mogelijke match dienen. De bedrijfsgegevens wijzigen niets in Rentman of de login.</small>
  </div>
  <div className="crewProfileFooter"><span>Bij een unieke overeenkomst doet de factuurverwerking een voorstel. Kantoor bevestigt de koppeling altijd zelf.</span>
   <button type="submit" className="button orange" disabled={saving}>{saving?'Opslaan…':'Bedrijfsgegevens opslaan'}</button>
  </div>
  {message&&<p role={message.ok?'status':'alert'} className={'crewProfileMessage '+(message.ok?'success':'error')}>{message.message}</p>}
 </form>;
}
export default function CrewProfilesManager({members}:{members:Member[]}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<'active'|'all'>('active');
 const [selectedId,setSelectedId]=useState(members.find(m=>m.active&&!m.portal_deleted)?.id||members[0]?.id||'');
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase();
  return members.filter(m=>!m.portal_deleted&&(filter==='all'||m.active))
   .filter(m=>!q||[m.full_name,m.company_name,m.company_alias,m.email,m.rentman_email,m.invoice_email]
    .some(v=>(v||'').toLowerCase().includes(q)));
 },[members,filter,query]);
 const selected=filtered.find(m=>m.id===selectedId)||filtered[0];
 const incomplete=members.filter(m=>m.active&&!m.portal_deleted&&(!m.company_name||!m.invoice_email)).length;
 return <div className="crewProfilesWorkspace">
  <aside className="crewProfileList">
   <header><h2>Bartenders</h2><span>{members.filter(m=>m.active&&!m.portal_deleted).length} actief</span></header>
   <div className="crewProfileFilters">
    <div className="crewProfileSearch"><Search size={15}/><input type="search" placeholder="Naam, bedrijf of e-mail…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="crewProfileToggle"><button type="button" className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Rentman actief</button><button type="button" className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Alles</button></div>
   </div>
   <div className="crewProfileRows">{filtered.map(m=><button type="button" key={m.id} onClick={()=>setSelectedId(m.id)}
    className={'crewProfileRow '+(selected?.id===m.id?'selected':'')}>
    <span className="crewProfileAvatar small">{m.full_name?.trim().charAt(0).toUpperCase()||'C'}</span>
    <span><strong>{m.full_name}</strong><small>{m.company_name||m.invoice_email||'Geen bedrijfsgegevens'}</small></span>
    {!m.company_name||!m.invoice_email?<i className="crewProfileMissing" title="Bedrijfsgegevens nog niet volledig ingevuld"/>:null}
   </button>)}
    {!filtered.length?<p className="crewProfileEmpty">Geen crewleden gevonden.</p>:null}
   </div>
  </aside>
  <section className="crewProfileContent">
   <div className="crewProfileBanner"><Building2 size={17}/><span>{incomplete} actieve crewleden hebben nog geen volledige bedrijfsnaam en factuur e-mailadres.</span></div>
   {selected?<CrewEditor key={selected.id} member={selected}/>:<div className="notice">Selecteer een crewlid in het overzicht.</div>}
  </section>
 </div>;
}
