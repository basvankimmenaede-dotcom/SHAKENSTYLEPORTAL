'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {Search,CheckCircle2,AlertCircle,Clock3} from 'lucide-react';
type Member={
 id:string;name:string;email:string;rentmanActive:boolean;portalEnabled:boolean;manualDisabled:boolean;
 portalDeleted:boolean;lastSyncedAt:string|null;accountState:'active'|'confirmed'|'invited'|'missing';
};
const accountLabels:Record<Member['accountState'],string>={
 active:'Eerder ingelogd',confirmed:'Geactiveerd',invited:'Uitgenodigd',missing:'Geen inlogaccount'
};
export default function CrewAccessStatus({members}:{members:Member[]}){
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<'all'|'disabled'|'missing'>('all');
 const filtered=useMemo(()=>members.filter(m=>{
  const matches=!query.trim()||[m.name,m.email].some(x=>x.toLowerCase().includes(query.trim().toLowerCase()));
  return matches&&(filter==='all'||(filter==='disabled'&&(!m.portalEnabled||m.manualDisabled||m.portalDeleted))||
   (filter==='missing'&&m.accountState==='missing'));
 }),[members,query,filter]);
 return <section className="card crewAccessCard">
  <div className="crewAccessHeader">
   <div><h2>Portaaltoegang crew</h2><p>Het portal heeft een eigen toegangsstatus. De status uit Rentman heeft geen invloed op inloggen.</p></div>
   <Link className="button secondary" href="/admin/users/crew">Portaaltoegang beheren</Link>
  </div>
  <div className="crewAccessFilters">
   <label><Search size={16}/><input type="search" value={query} placeholder="Zoek medewerker of e-mailadres…" onChange={e=>setQuery(e.target.value)}/></label>
   <div>{([
    ['all','Alle'],
    ['disabled','Portaal uit'],
    ['missing','Geen inlogaccount']
   ] as const).map(([value,label])=><button type="button" key={value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{label}</button>)}</div>
  </div>
  <div className="crewAccessTableWrap">
   <table className="crewAccessTable">
    <thead><tr><th>Medewerker</th><th>Portaaltoegang</th><th>Inlogaccount</th><th>Rentman (info)</th><th>Synchronisatie</th></tr></thead>
    <tbody>{filtered.map(m=><tr key={m.id}>
     <td><strong>{m.name}</strong><small>{m.email||'Geen e-mailadres'}</small></td>
     <td><span className={'crewAccessPill '+(m.portalEnabled&&!m.manualDisabled&&!m.portalDeleted?'good':'warn')}>
      {m.portalEnabled&&!m.manualDisabled&&!m.portalDeleted?<CheckCircle2 size={14}/>:<AlertCircle size={14}/>}
      {m.portalDeleted?'Verwijderd':m.manualDisabled?'Geblokkeerd':m.portalEnabled?'Toegang aan':'Toegang uit'}
     </span></td>
     <td><span className={'crewAccessPill '+(m.accountState==='active'?'good':m.accountState==='missing'?'warn':'')}>
      {accountLabels[m.accountState]}</span></td>
     <td><span className="crewAccessPill">{m.rentmanActive?'Actief':'Inactief'}</span></td>
     <td>{m.lastSyncedAt?new Date(m.lastSyncedAt).toLocaleDateString('nl-NL'): 'Onbekend'}</td>
    </tr>)}</tbody>
   </table>
   {!filtered.length?<p className="crewAccessEmpty">Geen medewerkers binnen dit filter.</p>:null}
  </div>
  <div className="crewAccessFoot"><Clock3 size={15}/> Portaaltoegang beheer je onder Crewprofielen. Inlogaccounts moeten daarnaast nog een eigen activatie en wachtwoord hebben.</div>
 </section>;
}
