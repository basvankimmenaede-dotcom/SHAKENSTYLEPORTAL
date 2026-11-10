'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {Search,CheckCircle2,AlertCircle,Clock3} from 'lucide-react';
type Member={
 id:string;name:string;email:string;rentmanActive:boolean;manualDisabled:boolean;
 portalDeleted:boolean;lastSyncedAt:string|null;accountState:'active'|'confirmed'|'invited'|'missing';
};
const accountLabels:Record<Member['accountState'],string>={
 active:'Eerder ingelogd',confirmed:'Geactiveerd',invited:'Uitgenodigd',missing:'Geen portaalaccount'
};
export default function CrewAccessStatus({members}:{members:Member[]}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<'all'|'inactive'|'missing'>('all');
 const filtered=useMemo(()=>members.filter(m=>{
  const matches=!query.trim()||[m.name,m.email].some(x=>x.toLowerCase().includes(query.trim().toLowerCase()));
  return matches&&(filter==='all'||(filter==='inactive'&&(!m.rentmanActive||m.manualDisabled||m.portalDeleted))||
   (filter==='missing'&&m.accountState==='missing'));
 }),[members,query,filter]);
 return <section className="card crewAccessCard">
  <div className="crewAccessHeader">
   <div><h2>Logincontrole crew</h2><p>Rentman actief, handmatige blokkades en inlogaccount zijn drie afzonderlijke statussen.</p></div>
   <Link className="button secondary" href="/admin/users/crew">Crewprofielen beheren</Link>
  </div>
  <div className="crewAccessFilters">
   <label><Search size={16}/><input type="search" value={query} placeholder="Zoek crewlid of e-mailadres…" onChange={e=>setQuery(e.target.value)}/></label>
   <div>{([
    ['all','Alle'],
    ['inactive','Niet actief in Rentman'],
    ['missing','Geen portaalaccount']
   ] as const).map(([value,label])=><button type="button" key={value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{label}</button>)}</div>
  </div>
  <div className="crewAccessTableWrap">
   <table className="crewAccessTable">
    <thead><tr><th>Medewerker</th><th>Rentman</th><th>Portaalblokkade</th><th>Loginstatus</th><th>Gesynchroniseerd</th></tr></thead>
    <tbody>{filtered.map(m=><tr key={m.id}>
     <td><strong>{m.name}</strong><small>{m.email||'Geen adres'}</small></td>
     <td><span className={'crewAccessPill '+(m.rentmanActive?'good':'warn')}>
      {m.rentmanActive?<CheckCircle2 size={14}/>:<AlertCircle size={14}/>}
      {m.rentmanActive?'Actief':'Inactief'}</span></td>
     <td><span className={'crewAccessPill '+(!m.manualDisabled&&!m.portalDeleted?'good':'warn')}>
      {m.portalDeleted?'Verwijderd':m.manualDisabled?'Geblokkeerd':'Geen blokkade'}</span></td>
     <td><span className={'crewAccessPill '+(m.accountState==='active'?'good':m.accountState==='missing'?'warn':'')}>
      {accountLabels[m.accountState]}</span></td>
     <td>{m.lastSyncedAt?new Date(m.lastSyncedAt).toLocaleDateString('nl-NL'): 'Niet bekend'}</td>
    </tr>)}</tbody>
   </table>
   {!filtered.length?<p className="crewAccessEmpty">Geen crewleden binnen dit filter.</p>:null}
  </div>
  <div className="crewAccessFoot"><Clock3 size={15}/> Rentman geeft een aparte actieve status terug. &lsquo;Weergeven in planner&rsquo; of &lsquo;Kan inloggen&rsquo; hoeft niet dezelfde instelling te zijn.</div>
 </section>;
}
