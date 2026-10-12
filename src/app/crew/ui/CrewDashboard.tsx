'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';

type ShiftReport={id:string;status:string;submitted_at:string|null;work_started_at:string;work_ended_at:string;break_minutes:number;travel_minutes:number;expenses_amount:number;expenses_description:string|null;breakage_over_ten:boolean;missing_materials:boolean;missing_materials_description:string|null;notes:string|null};
type Assignment={id:string;project_name:string;project_location:string|null;starts_at:string;ends_at:string;crew_shift_reports:ShiftReport[]|null};
export default function CrewDashboard({memberName,assignments,adminPreview=false}:{memberName:string;assignments:Assignment[];adminPreview?:boolean}) {
 const [selected,setSelected]=useState<Assignment|null>(null); const [viewing,setViewing]=useState<Assignment|null>(null);
 const [saving,setSaving]=useState(false); const [missingYes,setMissingYes]=useState(false); const [message,setMessage]=useState('');
 const router=useRouter();
 async function submit(formData:FormData){if(!selected)return;setSaving(true);setMessage('');
 const start=String(formData.get('start'));const end=String(formData.get('end'));
 const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(selected.starts_at));
 const parseAmsterdam=(date:string,time:string)=>{
  const utc=new Date(date+'T'+time+':00Z');
  if(Number.isNaN(utc.getTime()))return new Date(NaN);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Amsterdam',timeZoneName:'shortOffset'}).formatToParts(utc);
  const offset=parts.find(p=>p.type==='timeZoneName')?.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const minutes=offset?(offset[1]==='+'?1:-1)*(Number(offset[2])*60+Number(offset[3]||0)):60;
  return new Date(utc.getTime()-minutes*60000);
 };
 const startsAt=parseAmsterdam(localDate,start);
 let endsAt=parseAmsterdam(localDate,end);
 if(endsAt<=startsAt){const next=new Date(localDate+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);endsAt=parseAmsterdam(next.toISOString().slice(0,10),end);}
 if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||endsAt<=startsAt||endsAt.getTime()-startsAt.getTime()>86400000){setMessage('Controleer de begin- en eindtijd. Een dienst mag maximaal 24 uur duren.');setSaving(false);return;}
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
 const {data:member}=await supabase.from('crew_portal_members').select('id').eq('active',true).maybeSingle();
 if(!member){setMessage('Je toegang is niet gekoppeld.');setSaving(false);return}
 const {error}=await supabase.from('crew_shift_reports').insert({...data,crew_member_id:member.id,status:'submitted'});
 setSaving(false);
 if(error){setMessage(error.code==='23505'?'Voor deze dienst is al een shiftrapport ingediend. Open het bestaande rapport.':'Opslaan mislukt: '+error.message);router.refresh();return}
 setSelected(null);router.refresh();setMessage('Shiftrapport ingediend. Je kunt het rapport voortaan inzien.');}

 const fmt=(d:string)=>new Date(d).toLocaleString('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 return <main style={{minHeight:'100vh',background:'var(--bg)',padding:'30px 16px',color:'#202020'}}>
 <div style={{maxWidth:650,margin:'auto'}}>
 <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><div style={{width:205,maxWidth:"55vw"}}><BrandLogo dark /></div><p style={{color:'var(--muted)'}}>Mijn diensten · {memberName}</p></div>{!adminPreview&&<button onClick={async()=>{await createClient().auth.signOut();router.refresh()}} style={{border:0,background:'transparent',textDecoration:'underline'}}>Uitloggen</button>}</header>
 {adminPreview&&<div role="status" style={{marginTop:20,padding:14,borderRadius:10,background:'#fff0dc',color:'#713e0b'}}><strong>Adminvoorbeeld — alleen lezen</strong><p style={{margin:'6px 0 0'}}>Je bekijkt de diensten van {memberName}. Je bent niet als deze medewerker ingelogd en kunt geen rapporten indienen.</p></div>}
 <section style={{background:'var(--panel)',borderRadius:18,padding:24,marginTop:20}}>
 <h1 style={{fontSize:23}}>Mijn diensten</h1><p style={{color:'var(--muted)'}}>Van 7 dagen geleden tot 7 dagen vooruit. Je kunt een rapport indienen zodra je dienst is afgelopen.</p>
 {assignments.length===0&&<p>Er zijn geen diensten gevonden in deze periode.</p>}
 {assignments.map(a=>{const report=a.crew_shift_reports?.[0];const ended=new Date(a.ends_at).getTime()<=Date.now();return <div key={a.id} style={{padding:'18px 0',borderTop:'1px solid #eee'}}>
 <strong>{a.project_name}</strong><p style={{color:'var(--muted)',margin:'5px 0'}}>{fmt(a.starts_at)} – {fmt(a.ends_at)} · {a.project_location||'Locatie volgt'}</p>
 {report?<button type="button" onClick={()=>{setViewing(a);setSelected(null)}} style={{background:'transparent',border:'1px solid var(--border,#ddd)',borderRadius:8,padding:'8px 12px',fontWeight:600,cursor:'pointer'}}>✓ Rapport bekijken</button>:adminPreview?<span style={{color:'#777'}}>{ended?'Rapport nog niet ingediend':'Nog gepland'}</span>:<button disabled={!ended} onClick={()=>{setSelected(a);setMessage('')}} style={{padding:'9px 14px',background:ended?'var(--orange)':'#ddd',color:ended?'white':'#555',border:0,borderRadius:8}}>{ended?'Shiftrapport invullen':'Nog gepland'}</button>}
 </div>})}</section>
 {viewing?.crew_shift_reports?.[0] && <section style={{background:'var(--panel)',border:'1px solid var(--border,#ddd)',borderRadius:14,padding:18,marginTop:16}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><div style={{fontSize:12,color:'var(--muted)'}}>INGEDIEND · ALLEEN LEZEN</div><h2 style={{fontSize:18,margin:'5px 0'}}>{viewing.project_name}</h2></div><button type="button" onClick={()=>setViewing(null)} style={{background:'transparent',border:'1px solid var(--border,#ddd)',borderRadius:8,padding:8,cursor:'pointer'}}>Sluiten</button></div>
 {(() => { const report=viewing.crew_shift_reports![0];const show=(value:string)=>new Date(value).toLocaleString('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});const fields:[string,string][]=[['Begin',show(report.work_started_at)],['Eind',show(report.work_ended_at)],['Pauze',report.break_minutes+' min'],['Reistijd',report.travel_minutes+' min'],['Onkosten','€ '+Number(report.expenses_amount||0).toLocaleString('nl-NL',{minimumFractionDigits:2})],['Omschrijving onkosten',report.expenses_description||'—'],['Meer dan 10 glazen gebroken',report.breakage_over_ten?'Ja':'Nee'],['Ontbrekend materiaal',report.missing_materials?'Ja':'Nee'],['Omschrijving ontbrekend materiaal',report.missing_materials_description||'—'],['Opmerkingen',report.notes||'—']];return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:10,marginTop:16}}>{fields.map(([label,value])=><div key={label} style={{padding:'9px 11px',borderRadius:8,background:'var(--bg,#f8f8f8)'}}><div style={{fontSize:11,color:'var(--muted)'}}>{label}</div><div style={{fontSize:13,fontWeight:600,whiteSpace:'pre-wrap'}}>{value}</div></div>)}</div>})()}
 <p style={{fontSize:12,color:'var(--muted)',marginBottom:0}}>Dit rapport is definitief ingediend en kan niet opnieuw worden ingestuurd.</p>
 </section>}
 {!adminPreview&&selected&&<section style={{background:'var(--panel)',borderRadius:16,padding:20,marginTop:16,border:'1px solid var(--border,#eee)'}}>
 <div style={{fontSize:11,fontWeight:750,letterSpacing:1.2,textTransform:'uppercase',color:'var(--orange)',marginBottom:6}}>Dienst afronden</div><h2 style={{fontSize:19,letterSpacing:'-.02em',margin:'0 0 16px'}}>Shiftrapport · {selected.project_name}</h2>
 <form action={submit} style={{display:'grid',gap:12}}><style>{`.crew-field{display:block;box-sizing:border-box;width:100%;min-height:42px;padding:9px 12px;margin-top:5px;border:1px solid var(--border,#dedbd7);border-radius:9px;background:var(--bg,#fff);color:var(--text,#202020);font:inherit;font-size:14px;outline:none}.crew-field:focus{border-color:var(--orange);box-shadow:0 0 0 3px rgba(245,105,25,.12)}.crew-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.crew-label{font-size:12px;font-weight:650;color:var(--text,#333)}.crew-field::placeholder{color:#a7a7a7}@media(max-width:480px){.crew-grid{grid-template-columns:1fr}}`}</style><div style={{fontSize:12,fontWeight:700,color:'var(--muted)'}}>WERKTIJD</div><div className="crew-grid">
 <label>Werkelijke begintijd <input name="start" type="time" required defaultValue={new Date(selected.starts_at).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hour12:false})} className="crew-field"/></label>
 <label>Werkelijke eindtijd <input name="end" type="time" required defaultValue={new Date(selected.ends_at).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hour12:false})} className="crew-field"/></label></div><div className="crew-grid">
 <label>Pauze (minuten) <input name="break" type="number" min="0" max="1440" placeholder="0" className="crew-field"/></label>
 <label>Totale reistijd, heen en terug (minuten) <input name="travel" type="number" min="0" max="1440" placeholder="0" required className="crew-field"/></label></div>
 <small style={{fontSize:11,color:'var(--muted)',lineHeight:1.5}}>Amsterdam: geen reistijdvergoeding. Buiten Amsterdam: eerste 30 minuten eigen tijd, daarna 75% van je afgesproken uurtarief. De definitieve berekening volgt na controle.</small><div style={{fontSize:12,fontWeight:700,color:'var(--muted)',marginTop:8}}>KOSTEN & BIJZONDERHEDEN</div>
 <label>Gemaakte kosten (€) <input name="expenses" type="number" min="0" step="0.01" placeholder="0" required className="crew-field"/></label>
 <label>Omschrijving onkosten <textarea name="expense_note" rows={2} className="crew-field"/></label>
 <label>Meer dan 10 glazen gebroken? <select name="breakage" className="crew-field"><option value="no">Nee</option><option value="yes">Ja</option></select></label>
 <label>Misten er materialen of producten? <select name="missing" className="crew-field" onChange={e=>setMissingYes(e.target.value==="yes")}><option value="no">Nee</option><option value="yes">Ja</option></select></label>
 {missingYes&&<label>Welke materialen ontbraken? <textarea name="missing_note" rows={2} required className="crew-field" placeholder="Omschrijf wat er ontbreekt"/></label>}
 <label>Opmerkingen <textarea name="notes" rows={2} className="crew-field"/></label>
 <button disabled={saving} style={{background:'var(--orange)',color:'white',border:0,borderRadius:9,padding:13}}>{saving?'Bezig…':'Shiftrapport indienen'}</button>
 <button type="button" onClick={()=>setSelected(null)} style={{border:0,background:'transparent'}}>Annuleren</button></form></section>}
 {message&&<p role="status">{message}</p>}
 </div></main>;
}
