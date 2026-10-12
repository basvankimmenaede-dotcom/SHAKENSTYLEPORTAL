'use client';
import { FormEvent, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';

export default function CrewLogin({ signedInButNotLinked = false }: {signedInButNotLinked?: boolean}) {
 const [email,setEmail]=useState(''); const [status,setStatus]=useState(''); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){
 e.preventDefault();setBusy(true);setStatus('');
 try {
 const response=await fetch('/api/crew/login-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim()})});
 const result=await response.json();
 setStatus(response.ok?result.message:(result.error||'De e-mail kon niet worden verstuurd.'));
 }catch{setStatus('De e-mail kon niet worden verstuurd. Probeer later opnieuw.')}
 setBusy(false);
 }
 return <main className="loginPage">
 <section className="loginCard">
 <div className="loginBrand"><BrandLogo dark /></div>
 <p className="muted" style={{margin:'18px 0 4px',fontWeight:700}}>SHAKENSTYLE CREW</p>
 <h1 style={{fontSize:27,letterSpacing:'-.04em',margin:'8px 0 10px'}}>Mijn diensten</h1>
 <p className="muted" style={{lineHeight:1.6,marginBottom:24}}>Bekijk je geplande diensten en vul na afloop je shiftrapport in. Je hebt geen wachtwoord nodig.</p>
 {signedInButNotLinked&&<div className="error">Dit e-mailadres is nog niet gekoppeld aan een Rentman-medewerker. Neem contact op met kantoor.</div>}
 <form onSubmit={submit}>
 <div className="field"><label htmlFor="crew-email">E-mailadres</label>
 <input className="input" id="crew-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" autoComplete="email"/></div>
 <button className="button orange" type="submit" disabled={busy} style={{width:'100%',marginTop:8}}>{busy?'Even wachten…':'Stuur mijn persoonlijke inloglink'}</button>
 </form>
 {status&&<div role="status" className={status.startsWith('De inloglink')?'error':'success'}>{status}</div>}
 <p className="muted" style={{fontSize:12,lineHeight:1.5,marginTop:22}}>Alleen voor medewerkers van SHAKENSTYLE. Je ziet uitsluitend je eigen diensten en rapporten.</p>
 </section></main>;
}
