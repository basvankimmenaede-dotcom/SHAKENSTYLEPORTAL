'use client';
import {useState} from 'react';
import Link from 'next/link';
type Member={id:string;rentman_crew_id:number;full_name:string;email:string;rentman_email:string|null;login_email_override:string|null;active:boolean;last_synced_at:string|null};
export default function CrewMemberManager({members}:{members:Member[]}){
 const [rows,setRows]=useState(members);const [passwordFor,setPasswordFor]=useState<string|null>(null);const [newPassword,setNewPassword]=useState('');const [savedActive,setSavedActive]=useState<Record<string,boolean>>(()=>Object.fromEntries(members.map(m=>[m.id,m.active])));const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [rowFeedback,setRowFeedback]=useState<Record<string,{ok:boolean;message:string}>>({});const [search,setSearch]=useState('');
 const visibleRows=rows.filter(m=>[m.full_name,m.rentman_email,m.email,m.login_email_override,String(m.rentman_crew_id)].some(v=>(v||'').toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b)=>Number(savedActive[b.id]??b.active)-Number(savedActive[a.id]??a.active)||a.full_name.localeCompare(b.full_name,'nl'));
 async function sync(){
  setBusy(true);setNotice('');
  try{const res=await fetch('/api/crew/admin/sync',{method:'POST'});const result=await res.json();
   if(!res.ok)throw Error(result.error||'Synchronisatie mislukt');
   setNotice(`${result.synced} medewerkers gesynchroniseerd, ${result.missingEmail} zonder e-mailadres, ${result.skipped} overgeslagen. Vernieuw de pagina om de lijst te zien.`);
  }catch(e){setNotice(e instanceof Error?e.message:'Synchronisatie mislukt')}finally{setBusy(false)}
 }
 async function setPassword(m:Member){
  if(newPassword.length<8){setRowFeedback(prev=>({...prev,[m.id]:{ok:false,message:'Gebruik minimaal 8 tekens voor het wachtwoord.'}}));return;}
  setBusy(true);setNotice('');setRowFeedback(prev=>({...prev,[m.id]:{ok:true,message:'Wachtwoord wordt opgeslagen…'}}));
  try{
   const res=await fetch('/api/crew/admin/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id,password:newPassword})});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||'Wachtwoord instellen mislukt');
   setRowFeedback(prev=>({...prev,[m.id]:{ok:true,message:'Wachtwoord succesvol opgeslagen voor '+m.full_name+'. De medewerker kan nu inloggen.'}}));
   setNewPassword('');setPasswordFor(null);
  }catch(e){setRowFeedback(prev=>({...prev,[m.id]:{ok:false,message:e instanceof Error?e.message:'Wachtwoord instellen mislukt'}}))}
  finally{setBusy(false)}
 }
 async function save(m:Member){
  setBusy(true);setNotice('');
  try{const res=await fetch('/api/crew/admin/members',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id,email:m.login_email_override,active:m.active})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Opslaan mislukt');setSavedActive(prev=>({...prev,[m.id]:m.active}));setRowFeedback(prev=>({...prev,[m.id]:{ok:true,message:'Medewerkergegevens succesvol opgeslagen.'}}));
  }catch(e){setRowFeedback(prev=>({...prev,[m.id]:{ok:false,message:e instanceof Error?e.message:'Opslaan mislukt'}}))}finally{setBusy(false)}
 }
 return <div className="stack" style={{padding:"24px 36px 36px",minWidth:0}}>
 <div className="split" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}><strong>{rows.length} medewerkers</strong><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="button orange" onClick={sync} disabled={busy}>{busy?'Even wachten…':'Synchroniseer met Rentman'}</button></div></div>
 <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}><input className="input" type="search" aria-label="Zoek medewerkers" placeholder="Zoek op naam, e-mail of Rentman-nummer..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",maxWidth:420}}/>{search&&<span className="muted">{visibleRows.length} van {rows.length} medewerkers</span>}</div>
 {notice&&<div className="notice" role="status">{notice}</div>}
 <div className="tableWrap" style={{width:"100%",maxWidth:"100%",overflowX:"auto"}}><table style={{width:"100%",minWidth:800}}><thead><tr><th>Medewerker</th><th>Rentman e-mail</th><th>Inlog e-mail (afwijkend)</th><th>Actief</th><th></th></tr></thead>
 <tbody>{visibleRows.map(m=><tr key={m.id}><td><strong>{m.full_name}</strong><div className="muted">Rentman #{m.rentman_crew_id}</div></td><td>{m.rentman_email||m.email}</td>
 <td><input className="input" type="email" aria-label={'Inlogadres '+m.full_name} placeholder="Zelfde als Rentman" value={m.login_email_override||''} onChange={e=>setRows(prev=>prev.map(x=>x.id===m.id?{...x,login_email_override:e.target.value}:x))}/></td>
 <td><input type="checkbox" aria-label={'Actief '+m.full_name} checked={m.active} onChange={e=>setRows(prev=>prev.map(x=>x.id===m.id?{...x,active:e.target.checked}:x))}/></td>
 <td><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button className="button secondary" disabled={busy} onClick={()=>{setPasswordFor(passwordFor===m.id?null:m.id);setNewPassword("");setNotice("")}}>Wachtwoord</button><Link className="button secondary" href={`/planning/instellingen/crew/${m.id}`} title={`Bekijk Crew-portaal van ${m.full_name}`}>Bekijk als medewerker</Link><button className="button secondary" disabled={busy} onClick={()=>save(m)}>Opslaan</button></div>{passwordFor===m.id&&<div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}><input className="input" type="password" autoComplete="new-password" aria-label={'Nieuw wachtwoord '+m.full_name} placeholder="Minimaal 8 tekens" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button className="button orange" disabled={busy||newPassword.length<8} onClick={()=>setPassword(m)}>Instellen</button></div>}{rowFeedback[m.id]&&<div role="status" aria-live="polite" style={{marginTop:8,fontWeight:600,color:rowFeedback[m.id].ok?'#157347':'#b42318'}}>{rowFeedback[m.id].message}</div>}</td></tr>)}{visibleRows.length===0&&<tr><td colSpan={5} className="muted" style={{padding:24,textAlign:"center"}}>Geen medewerkers gevonden.</td></tr>}</tbody></table></div>
 </div>;
}
