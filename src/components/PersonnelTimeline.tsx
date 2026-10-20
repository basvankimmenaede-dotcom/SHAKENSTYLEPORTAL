'use client';
import { useMemo,useState } from 'react';
import Link from 'next/link';
import { ArrowLeft,ArrowRight,RotateCcw,Search,Clock,MapPin,ExternalLink,AlertTriangle } from 'lucide-react';
import styles from './PersonnelTimeline.module.css';
type Shift={id:number;personId:number;person:string;role:string;name:string;start:string;end:string;projectId:number|null;projectName:string|null;projectNumber:string|null;customer:string|null;location:string|null;address:string|null};
type View='day'|'three'|'week';
const DAY=86400000;
function add(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function localDate(iso:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function mins(iso:string){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)).split(':').map(Number);return p[0]*60+p[1];}
function fmt(iso:string){return new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}
function dayLabel(date:string){return new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).format(new Date(date+'T12:00:00Z'));}
function classify(name:string){return /heen|terug|reis|transport|rit/i.test(name)?'travel':/magazijn|warehouse/i.test(name)?'warehouse':'work';}
export default function PersonnelTimeline({shifts,today,error}:{shifts:Shift[];today:string;error:string}){
 const [anchor,setAnchor]=useState(today),[view,setView]=useState<View>('three'),[rotated,setRotated]=useState(false),[search,setSearch]=useState(''),[role,setRole]=useState('all'),[selected,setSelected]=useState<Shift|null>(null),[travel,setTravel]=useState(true);
 const days=view==='day'?1:view==='three'?3:7;
 const dates=Array.from({length:days},(_,i)=>add(anchor,i));
 const roles=Array.from(new Set(shifts.map(s=>s.role))).sort();
 const people=useMemo(()=>{const map=new Map<number,{id:number;name:string;role:string}>();shifts.forEach(s=>map.set(s.personId,{id:s.personId,name:s.person,role:s.role}));return [...map.values()].filter(p=>(role==='all'||p.role===role)&&p.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'nl'));},[shifts,role,search]);
 const visible=shifts.filter(s=>people.some(p=>p.id===s.personId)&&(travel||classify(s.name)!=='travel')&&new Date(s.start).getTime()<new Date(add(anchor,days)+'T00:00:00Z').getTime()&&new Date(s.end).getTime()>=new Date(anchor+'T00:00:00Z').getTime());
 const conflicts=new Set<number>();
 for(const p of people){const list=visible.filter(s=>s.personId===p.id).sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<list.length;i++)if(new Date(list[i].start)<new Date(list[i-1].end)){conflicts.add(list[i].id);conflicts.add(list[i-1].id);}}
 const step=days===1?2:4;
 const rowWidth=days*360;
 const blocks=(p:number)=>visible.filter(s=>s.personId===p).map(s=>{
  const begin=localDate(s.start),finish=localDate(s.end);
  let a=dates.indexOf(begin),b=dates.indexOf(finish);
  if(a<0)a=begin<anchor?0:days;
  if(b<0)b=finish<anchor?0:days-1;
  const x=a*360+Math.max(0,mins(s.start)/1440*360);
  const endX=b*360+mins(s.end)/1440*360;
  const width=Math.max(12,Math.min(rowWidth-x,endX-x));
  return <button key={s.id} type="button" title={s.name+' · '+fmt(s.start)+' – '+fmt(s.end)} onClick={()=>setSelected(s)} className={styles.block+' '+styles[classify(s.name)]+(conflicts.has(s.id)?' '+styles.conflict:'')} style={{left:x,width}}><span>{s.name}</span><small>{fmt(s.start).split(', ').pop()}</small></button>;
 });
 return <main className={styles.page}>
  <header className={styles.header}><div><h1>Personeelstijdlijn</h1><p>Medewerkers en diensten · Rentman-planning</p></div><div className={styles.actions}><button onClick={()=>setAnchor(add(anchor,-days))} aria-label="Vorige periode"><ArrowLeft size={16}/></button><button onClick={()=>setAnchor(today)}>Vandaag</button><button onClick={()=>setAnchor(add(anchor,days))} aria-label="Volgende periode"><ArrowRight size={16}/></button><select value={view} onChange={e=>setView(e.target.value as View)}><option value="day">Dag</option><option value="three">3 dagen</option><option value="week">Week</option></select><button onClick={()=>setRotated(!rotated)}><RotateCcw size={15}/> Draai weergave</button></div></header>
  <div className={styles.filters}><label><Search size={16}/><input placeholder="Zoek medewerker..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select value={role} onChange={e=>setRole(e.target.value)}><option value="all">Alle functies</option>{roles.map(r=><option key={r}>{r}</option>)}</select><label className={styles.check}><input type="checkbox" checked={travel} onChange={e=>setTravel(e.target.checked)}/> Reistijd tonen</label><span className={styles.legend}>● Werk &nbsp; <span>● Reis</span> &nbsp; <b>● Conflict</b></span></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.content}><div className={styles.timeline}>
  {!rotated?<div className={styles.scroll}><div className={styles.grid} style={{width:220+rowWidth}}>
   <div className={styles.stickyHead}><div className={styles.corner}>Medewerker</div><div className={styles.days} style={{width:rowWidth}}>{dates.map(d=><div key={d} className={styles.day} style={{width:360}}><strong>{dayLabel(d)}</strong><div className={styles.hours}>{Array.from({length:24/step},(_,i)=><span key={i}>{String(i*step).padStart(2,'0')}:00</span>)}</div></div>)}</div></div>
   {people.map(p=><div className={styles.line} key={p.id}><div className={styles.person}><strong>{p.name}</strong><small>{p.role}</small></div><div className={styles.track} style={{width:rowWidth,backgroundSize:'60px 100%'}}>{blocks(p.id)}</div></div>)}
  </div></div>:<div className={styles.scroll}><div className={styles.rotated} style={{minWidth:Math.max(660,100+people.length*160)}}><div className={styles.rotateHead}><span>Tijd</span>{people.map(p=><strong key={p.id}>{p.name}</strong>)}</div>{dates.map(date=><section key={date}><h3>{dayLabel(date)}</h3><div className={styles.rotateRows}><div className={styles.timeAxis}>{Array.from({length:13},(_,i)=><span key={i}>{String(i*2).padStart(2,'0')}:00</span>)}</div>{people.map(p=><div className={styles.verticalTrack} key={p.id}>{visible.filter(s=>s.personId===p.id&&localDate(s.start)===date).map(s=><button key={s.id} onClick={()=>setSelected(s)} className={styles.verticalBlock+' '+styles[classify(s.name)]} style={{top:mins(s.start)/1440*576,height:Math.max(20,(new Date(s.end).getTime()-new Date(s.start).getTime())/DAY*576)}}>{s.name}</button>)}</div>)}</div></section>)}</div></div>}
  {people.length===0&&<p className={styles.empty}>Geen medewerkers gevonden voor deze selectie.</p>}</div>
  <aside className={styles.side}>{selected?<><div className={styles.sideTitle}><div><span className={styles.eyebrow}>DIENSTDETAILS</span><h2>{selected.name}</h2></div><button onClick={()=>setSelected(null)}>Sluiten</button></div>
  <div className={styles.detailHero}><strong>{selected.projectName||'Projectgegevens niet beschikbaar'}</strong><span>{selected.projectNumber?'Project #'+selected.projectNumber:selected.projectId?'Rentman ID '+selected.projectId:'Geen project gekoppeld'}</span></div>
  <section className={styles.detailSection}><h3>Personeel & functie</h3><dl><dt>Medewerker</dt><dd>{selected.person}</dd><dt>Functie</dt><dd>{selected.role}</dd><dt>Soort dienst</dt><dd>{classify(selected.name)==='travel'?'Reistijd':'Werktijd'}</dd></dl></section>
  <section className={styles.detailSection}><h3>Tijdschema</h3><dl><dt>Start</dt><dd>{fmt(selected.start)}</dd><dt>Einde</dt><dd>{fmt(selected.end)}</dd><dt>Duur gepland</dt><dd>{Math.round((new Date(selected.end).getTime()-new Date(selected.start).getTime())/60000)/60} uur</dd><dt>Registratie</dt><dd>Nog niet gekoppeld</dd></dl></section>
  <section className={styles.detailSection}><h3>Project & locatie</h3><dl><dt>Opdrachtgever</dt><dd>{selected.customer||'Niet beschikbaar'}</dd><dt>Locatie</dt><dd>{selected.location||'Niet beschikbaar'}</dd><dt>Adres</dt><dd>{selected.address||'Niet beschikbaar'}</dd></dl>{selected.address&&<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(selected.address)} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> Open in Google Maps</a>}</section>
  {conflicts.has(selected.id)&&<p className={styles.error}><AlertTriangle size={15}/> Deze dienst overlapt een andere dienst van dezelfde medewerker.</p>}
  {selected.projectId&&<Link className={styles.projectLink} href={'/planning?project='+selected.projectId}><ExternalLink size={15}/> Naar projectplanning</Link>}
  <button className={styles.whatsapp} onClick={()=>{const msg=[selected.person,selected.projectName||selected.name,selected.projectNumber?'Project #'+selected.projectNumber:'',selected.role,fmt(selected.start)+' – '+fmt(selected.end),selected.address||selected.location||''].filter(Boolean).join('\n');window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');}}>Deel briefing via WhatsApp</button>
 </>:<><h2>Planningsoverzicht</h2><p>Klik op een dienst om de details te bekijken.</p><div className={styles.metric}><Clock size={18}/> {visible.length} diensten in deze periode</div><div className={styles.metric}><AlertTriangle size={18}/> {conflicts.size} overlappende diensten</div><div className={styles.metric}><MapPin size={18}/> Reisblokken apart gemarkeerd</div></>}</aside></div>
  <footer className={styles.footer}><div><strong>Open shifts</strong><p>Te koppelen aan de bestaande Open Shifts-module.</p></div><div><strong>Beschikbare medewerkers</strong><p>Vrije tijd is niet automatisch bevestigde beschikbaarheid.</p></div><div><strong>Route & reistijd</strong><p>Integratie met de bestaande routemodule volgt.</p></div></footer>
 </main>;
}
