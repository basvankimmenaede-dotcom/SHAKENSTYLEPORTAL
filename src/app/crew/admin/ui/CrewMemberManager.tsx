'use client';
import {useState} from 'react';
type Member={id:string;rentman_crew_id:number;full_name:string;email:string;rentman_email:string|null;login_email_override:string|null;active:boolean;last_synced_at:string|null};
export default function CrewMemberManager({members}:{members:Member[]}){
 const [rows,setRows]=useState(members);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 async function sync(){
  setBusy(true);setNotice('');
  try{const res=await fetch('/api/crew/admin/sync',{method:'POST'});const result=await res.json();
   if(!res.ok)throw Error(result.error||'Synchronisatie mislukt');
   setNotice(`${result.synced} medewerkers gesynchroniseerd, ${result.missingEmail} zonder e-mailadres, ${result.skipped} overgeslagen. Vernieuw de pagina om de lijst te zien.`);
  }catch(e){setNotice(e instanceof Error?e.message:'Synchronisatie mislukt')}finally{setBusy(false)}
 }
 async function save(m:Member){
  setBusy(true);setNotice('');
  try{const res=await fetch('/api/crew/admin/members',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id,email:m.login_email_override,active:m.active})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Opslaan mislukt');setNotice('Wijziging opgeslagen. Een gewijzigd adres moet eerst een Supabase Auth-account hebben voordat de inlogmail werkt.');
  }catch(e){setNotice(e instanceof Error?e.message:'Opslaan mislukt')}finally{setBusy(false)}
 }
 return <div className="stack" style={{padding:"24px 36px 36px",minWidth:0}}>
 <div className="split" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}><strong>{rows.length} medewerkers</strong><button className="button orange" onClick={sync} disabled={busy}>{busy?'Even wachten…':'Synchroniseer met Rentman'}</button></div>
 {notice&&<div className="notice" role="status">{notice}</div>}
 <div className="tableWrap" style={{width:"100%",maxWidth:"100%",overflowX:"auto"}}><table style={{width:"100%",minWidth:800}}><thead><tr><th>Medewerker</th><th>Rentman e-mail</th><th>Inlog e-mail (afwijkend)</th><th>Actief</th><th></th></tr></thead>
 <tbody>{rows.map(m=><tr key={m.id}><td><strong>{m.full_name}</strong><div className="muted">Rentman #{m.rentman_crew_id}</div></td><td>{m.rentman_email||m.email}</td>
 <td><input className="input" type="email" aria-label={'Inlogadres '+m.full_name} placeholder="Zelfde als Rentman" value={m.login_email_override||''} onChange={e=>setRows(prev=>prev.map(x=>x.id===m.id?{...x,login_email_override:e.target.value}:x))}/></td>
 <td><input type="checkbox" aria-label={'Actief '+m.full_name} checked={m.active} onChange={e=>setRows(prev=>prev.map(x=>x.id===m.id?{...x,active:e.target.checked}:x))}/></td>
 <td><button className="button secondary" disabled={busy} onClick={()=>save(m)}>Opslaan</button></td></tr>)}</tbody></table></div>
 </div>;
}
