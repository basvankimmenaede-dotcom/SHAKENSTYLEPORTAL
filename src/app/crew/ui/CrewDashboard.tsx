'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';

type Assignment={id:string;project_name:string;project_location:string|null;starts_at:string;ends_at:string;crew_shift_reports:{id:string;status:string}[]|null};
export default function CrewDashboard({memberName,assignments}:{memberName:string;assignments:Assignment[]}) {
 const [selected,setSelected]=useState<Assignment|null>(null);
 const [saving,setSaving]=useState(false); const [message,setMessage]=useState('');
 const router=useRouter();
 async function submit(formData:FormData){if(!selected)return;setSaving(true);setMessage('');
 const start=String(formData.get('start'));const end=String(formData.get('end'));
 const base=selected.starts_at.slice(0,10);
 const startsAt=new Date(base+'T'+start+':00');let endsAt=new Date(base+'T'+end+':00');
 if(endsAt<=startsAt)endsAt=new Date(endsAt.getTime()+86400000);
 const expenses=Number(formData.get('expenses')||0);
 const missing=formData.get('missing')==='yes';
 const data={assignment_id:selected.id,work_started_at:startsAt.toISOString(),work_ended_at:endsAt.toISOString(),
 break_minutes:Number(formData.get('break')||0),travel_minutes:Number(formData.get('travel')||0),
 expenses_amount:expenses,expenses_description:String(formData.get('expense_note')||''),
 breakage_over_ten:formData.get('breakage')==='yes',missing_materials:missing,
 missing_materials_description:String(formData.get('missing_note')||''),notes:String(formData.get('notes')||'')};
 if(missing&&!data.missing_materials_description.trim()){setMessage('Vermeld welke materialen ontbreken.');setSaving(false);return}
 if(expenses>0&&!data.expenses_description.trim()){setMessage('Omschrijf de gemaakte kosten.');setSaving(false);return}
 const supabase=createClient();
 const {data:member}=await supabase.from('crew_portal_members').select('id').maybeSingle();
 if(!member){setMessage('Je toegang is niet gekoppeld.');setSaving(false);return}
 const {error}=await supabase.from('crew_shift_reports').insert({...data,crew_member_id:member.id});
 setSaving(false);
 if(error){setMessage('Opslaan mislukt. Controleer de gegevens of neem contact op met kantoor.');return}
 setSelected(null);router.refresh();setMessage('Shiftrapport ontvangen.');}
 const fmt=(d:string)=>new Date(d).toLocaleString('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 return <main style={{minHeight:'100vh',background:'var(--bg)',padding:'30px 16px',color:'#202020'}}>
 <div style={{maxWidth:650,margin:'auto'}}>
 <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><div style={{width:205,maxWidth:"55vw"}}><BrandLogo dark /></div><p style={{color:'var(--muted)'}}>Mijn diensten · {memberName}</p></div><button onClick={async()=>{await createClient().auth.signOut();router.refresh()}} style={{border:0,background:'transparent',textDecoration:'underline'}}>Uitloggen</button></header>
 <section style={{background:'var(--panel)',borderRadius:18,padding:24,marginTop:20}}>
 <h1 style={{fontSize:23}}>Mijn diensten</h1><p style={{color:'var(--muted)'}}>Van 7 dagen geleden tot 7 dagen vooruit. Je kunt een rapport indienen zodra je dienst is afgelopen.</p>
 {assignments.length===0&&<p>Er zijn geen diensten gevonden in deze periode.</p>}
 {assignments.map(a=>{const report=a.crew_shift_reports?.[0];const ended=new Date(a.ends_at).getTime()<=Date.now();return <div key={a.id} style={{padding:'18px 0',borderTop:'1px solid #eee'}}>
 <strong>{a.project_name}</strong><p style={{color:'var(--muted)',margin:'5px 0'}}>{fmt(a.starts_at)} – {fmt(a.ends_at)} · {a.project_location||'Locatie volgt'}</p>
 {report?<span style={{color:'#29764d'}}>Rapport {report.status==='approved'?'goedgekeurd':'ingediend'}</span>:<button disabled={!ended} onClick={()=>{setSelected(a);setMessage('')}} style={{padding:'9px 14px',background:ended?'var(--orange)':'#ddd',color:ended?'white':'#555',border:0,borderRadius:8}}>{ended?'Shiftrapport invullen':'Nog gepland'}</button>}
 </div>})}</section>
 {selected&&<section style={{background:'var(--panel)',borderRadius:18,padding:24,marginTop:16}}>
 <h2 style={{fontSize:21}}>Shiftrapport · {selected.project_name}</h2>
 <form action={submit} style={{display:'grid',gap:14}}>
 <label>Werkelijke begintijd <input name="start" type="time" required defaultValue={selected.starts_at.slice(11,16)} style={{display:'block',padding:10,width:'100%'}}/></label>
 <label>Werkelijke eindtijd <input name="end" type="time" required defaultValue={selected.ends_at.slice(11,16)} style={{display:'block',padding:10,width:'100%'}}/></label>
 <label>Pauze (minuten) <input name="break" type="number" min="0" max="1440" defaultValue="0" required style={{display:'block',padding:10,width:'100%'}}/></label>
 <label>Totale reistijd, heen en terug (minuten) <input name="travel" type="number" min="0" max="1440" defaultValue="0" required style={{display:'block',padding:10,width:'100%'}}/></label>
 <small>Amsterdam: geen reistijdvergoeding. Buiten Amsterdam: eerste 30 minuten eigen tijd, daarna 75% van je afgesproken uurtarief. De definitieve berekening volgt na controle.</small>
 <label>Gemaakte kosten (€) <input name="expenses" type="number" min="0" step="0.01" defaultValue="0" required style={{display:'block',padding:10,width:'100%'}}/></label>
 <label>Omschrijving onkosten <textarea name="expense_note" rows={2} style={{display:'block',padding:10,width:'100%'}}/></label>
 <label>Meer dan 10 glazen gebroken? <select name="breakage" style={{display:'block',padding:10,width:'100%'}}><option value="no">Nee</option><option value="yes">Ja</option></select></label>
 <label>Misten er materialen of producten? <select name="missing" style={{display:'block',padding:10,width:'100%'}}><option value="no">Nee</option><option value="yes">Ja</option></select></label>
 <label>Welke materialen ontbraken? (verplicht bij ja) <textarea name="missing_note" rows={2} style={{display:'block',padding:10,width:'100%'}}/></label>
 <label>Opmerkingen <textarea name="notes" rows={2} style={{display:'block',padding:10,width:'100%'}}/></label>
 <button disabled={saving} style={{background:'var(--orange)',color:'white',border:0,borderRadius:9,padding:13}}>{saving?'Bezig…':'Shiftrapport indienen'}</button>
 <button type="button" onClick={()=>setSelected(null)} style={{border:0,background:'transparent'}}>Annuleren</button></form></section>}
 {message&&<p role="status">{message}</p>}
 </div></main>;
}
