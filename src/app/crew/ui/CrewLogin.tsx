'use client';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CrewLogin({ signedInButNotLinked = false }: {signedInButNotLinked?: boolean}) {
 const [email,setEmail]=useState(''); const [status,setStatus]=useState(''); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setStatus('');
 const supabase=createClient();
 const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin+'/auth/callback?next=/crew',shouldCreateUser:true}});
 setStatus(error?'De inloglink kon niet worden verstuurd. Probeer later opnieuw.':'Als dit adres bij ons bekend is, ontvang je een persoonlijke inloglink.');
 setBusy(false);
 }
 return <main style={{minHeight:'100vh',background:'#f5f5f4',display:'grid',placeItems:'center',padding:24}}>
 <section style={{background:'white',padding:32,borderRadius:20,maxWidth:420,width:'100%',boxShadow:'0 8px 36px #0001'}}>
 <div style={{fontWeight:900,fontSize:25,letterSpacing:1}}>SHAKENSTYLE</div>
 <p style={{color:'#666',marginTop:4}}>Mijn diensten · Shiftrapporten</p>
 <h1 style={{fontSize:24,marginTop:28}}>Inloggen zonder wachtwoord</h1>
 <p style={{lineHeight:1.5}}>Vul het e-mailadres in dat bij SHAKENSTYLE bekend is. Je ontvangt een beveiligde inloglink.</p>
 {signedInButNotLinked&&<p style={{color:'#a44'}}>Dit account is nog niet gekoppeld aan een Rentman-medewerker. Neem contact op met kantoor.</p>}
 <form onSubmit={submit}><label htmlFor="crew-email">E-mailadres</label>
 <input id="crew-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" style={{display:'block',width:'100%',padding:12,border:'1px solid #ddd',borderRadius:8,margin:'8px 0 18px'}}/>
 <button disabled={busy} style={{width:'100%',background:'#242424',color:'white',padding:13,border:0,borderRadius:9,cursor:'pointer'}}>{busy?'Even wachten…':'Stuur mijn inloglink'}</button></form>
 {status&&<p role="status" style={{marginTop:16}}>{status}</p>}
 </section></main>;
}
