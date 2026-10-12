'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';

export default function CrewLogin({signedInButNotLinked=false}:{signedInButNotLinked?:boolean}){
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const router=useRouter();
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setStatus('');
  try{
   const supabase=createClient();
   const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
   if(error){setStatus('E-mailadres of wachtwoord onjuist. Neem contact op met kantoor als je geen wachtwoord hebt.');return;}
   const {data:member,error:memberError}=await supabase.from('crew_portal_members').select('id').eq('active',true).maybeSingle();
   if(memberError||!member){
    await supabase.auth.signOut();
    setStatus('Dit account heeft geen actieve Crew-toegang. Neem contact op met kantoor.');
    return;
   }
   router.refresh();
  }catch{setStatus('Inloggen is tijdelijk niet mogelijk. Probeer het later opnieuw.')}
  finally{setBusy(false)}
 }
 return <main className="loginPage"><section className="loginCard">
  <div className="loginBrand"><BrandLogo dark/></div>
  <p className="muted" style={{margin:'18px 0 4px',fontWeight:700}}>SHAKENSTYLE CREW</p>
  <h1 style={{fontSize:27,letterSpacing:'-.04em',margin:'8px 0 10px'}}>Mijn diensten</h1>
  <p className="muted" style={{lineHeight:1.6,marginBottom:24}}>Log in met het e-mailadres en wachtwoord dat je van kantoor hebt gekregen.</p>
  {signedInButNotLinked&&<div className="error">Dit account heeft geen actieve Crew-toegang. Neem contact op met kantoor.</div>}
  <form onSubmit={submit}>
   <div className="field"><label htmlFor="crew-email">E-mailadres</label><input className="input" id="crew-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></div>
   <div className="field"><label htmlFor="crew-password">Wachtwoord</label><input className="input" id="crew-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></div>
   <button className="button orange" type="submit" disabled={busy} style={{width:'100%',marginTop:8}}>{busy?'Inloggen…':'Inloggen'}</button>
  </form>
  {status&&<div className="error" role="alert">{status}</div>}
  <p className="muted" style={{fontSize:12,lineHeight:1.5,marginTop:22}}>Alleen actieve medewerkers van SHAKENSTYLE kunnen inloggen.</p>
 </section></main>;
}
