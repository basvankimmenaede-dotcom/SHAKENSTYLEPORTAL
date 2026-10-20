'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import Link from 'next/link';
import { ArrowLeft,ArrowRight,RotateCcw,Search,Clock,MapPin,ExternalLink,AlertTriangle } from 'lucide-react';
import styles from './PersonnelTimeline.module.css';
type Shift={id:number;personId:number;person:string;role:string;name:string;start:string;end:string;projectId:number|null;projectName:string|null;projectNumber:string|null;customer:string|null;location:string|null;address:string|null;transport:string|null;outbound:boolean;returnTrip:boolean;subprojectName:string|null;travelBeforeMinutes:number|null;travelAfterMinutes:number|null};
type View='day'|'three'|'week';
const DAY=86400000;
const palette=['#b9d7fa','#ffd6a7','#d9c8ff','#a9e5d0','#ffc4d3','#b9e6e8','#f8e29e','#d2d8e3','#c6e1b0','#f6c8a6'];
const colorKey='sns-personnel-function-colors-v1';
const filterKey='sns-personnel-function-filter-v1';
function add(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function localDate(iso:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function mins(iso:string){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)).split(':').map(Number);return p[0]*60+p[1];}
function fmt(iso:string){return new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}
function dayLabel(date:string){return new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).format(new Date(date+'T12:00:00Z'));}
function classify(name:string){return /heen|terug|reis|transport|rit/i.test(name)?'travel':/magazijn|warehouse/i.test(name)?'warehouse':'work';}
export default function PersonnelTimeline({shifts,today,error}:{shifts:Shift[];today:string;error:string}){
 const [colors,setColors]=useState<Record<string,string>>({}),[editLegend,setEditLegend]=useState(false),[editFunctions,setEditFunctions]=useState(false),[hiddenFunctions,setHiddenFunctions]=useState<string[]>([]),[functionOrder,setFunctionOrder]=useState<string[]>([]),[anchor,setAnchor]=useState(today),[view,setView]=useState<View>('three'),[rotated,setRotated]=useState(false),[search,setSearch]=useState(''),[role,setRole]=useState('all'),[selected,setSelected]=useState<Shift|null>(null),[travel,setTravel]=useState(true);
 useEffect(()=>{try{const stored=window.localStorage.getItem(colorKey);if(stored){const parsed=JSON.parse(stored) as Record<string,string>;if(parsed&&typeof parsed==='object')setColors(parsed);}}catch{}},[]);
 useEffect(()=>{try{const value=window.localStorage.getItem(filterKey);if(value){const saved=JSON.parse(value) as {hidden?:string[];order?:string[]};if(Array.isArray(saved.hidden))setHiddenFunctions(saved.hidden);if(Array.isArray(saved.order))setFunctionOrder(saved.order);}}catch{}},[]);
 const functionNames=useMemo(()=>Array.from(new Set(shifts.map(s=>s.name))).sort((a,b)=>a.localeCompare(b,'nl')),[shifts]);
 const orderedFunctions=useMemo(()=>[...functionNames].sort((a,b)=>{const ai=functionOrder.indexOf(a),bi=functionOrder.indexOf(b);return (ai<0?9999:ai)-(bi<0?9999:bi)||a.localeCompare(b,'nl');}),[functionNames,functionOrder]);
 const persistFunctions=(hidden:string[],order:string[])=>{setHiddenFunctions(hidden);setFunctionOrder(order);try{window.localStorage.setItem(filterKey,JSON.stringify({hidden,order}));}catch{}};
 const moveFunction=(name:string,offset:number)=>{const next=[...orderedFunctions];const index=next.indexOf(name),target=index+offset;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];persistFunctions(hiddenFunctions,next);};
 const colorFor=(name:string)=>colors[name]||palette[Math.max(0,functionNames.indexOf(name))%palette.length];
 const setFunctionColor=(name:string,value:string)=>setColors(previous=>{const next={...previous,[name]:value};try{window.localStorage.setItem(colorKey,JSON.stringify(next));}catch{}return next;});
 const [zoom,setZoom]=useState(1);
 const zoomRef=useRef(1);
 const scrollRef=useRef<HTMLDivElement>(null);
 const dayWidth=360*zoom;
 useEffect(()=>{const element=scrollRef.current;if(!element||rotated)return;const onWheel=(event:WheelEvent)=>{if(!event.shiftKey)return;event.preventDefault();const previous=zoomRef.current;const next=Math.min(8,Math.max(.5,Math.round((previous+(event.deltaY<0?.25:-.25))*100)/100));if(next===previous)return;const bounds=element.getBoundingClientRect();const pointer=Math.max(0,event.clientX-bounds.left-220);const oldOffset=Math.max(0,element.scrollLeft-220);const relative=(oldOffset+pointer)/(360*previous);zoomRef.current=next;setZoom(next);requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollLeft=Math.max(0,220+relative*360*next-pointer);});};element.addEventListener('wheel',onWheel,{passive:false});return()=>element.removeEventListener('wheel',onWheel);},[rotated]);
 const days=view==='day'?1:view==='three'?3:7;
 const dates=Array.from({length:days},(_,i)=>add(anchor,i));
 const roles=Array.from(new Set(shifts.map(s=>s.role))).sort();
 const people=useMemo(()=>{const map=new Map<number,{id:number;name:string;role:string}>();shifts.filter(s=>!hiddenFunctions.includes(s.name)).forEach(s=>{if(!map.has(s.personId))map.set(s.personId,{id:s.personId,name:s.person,role:s.role});});const priority=(id:number)=>Math.min(9999,...shifts.filter(s=>s.personId===id&&!hiddenFunctions.includes(s.name)).map(s=>{const i=orderedFunctions.indexOf(s.name);return i<0?9999:i;}));return [...map.values()].filter(p=>(role==='all'||p.role===role)&&p.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>priority(a.id)-priority(b.id)||a.name.localeCompare(b.name,'nl'));},[shifts,role,search,hiddenFunctions,orderedFunctions]);
 const visible=shifts.filter(s=>!hiddenFunctions.includes(s.name)&&people.some(p=>p.id===s.personId)&&(travel||classify(s.name)!=='travel')&&new Date(s.start).getTime()<new Date(add(anchor,days)+'T00:00:00Z').getTime()&&new Date(s.end).getTime()>=new Date(anchor+'T00:00:00Z').getTime());
 const conflicts=new Set<number>();
 for(const p of people){const list=visible.filter(s=>s.personId===p.id).sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<list.length;i++)if(new Date(list[i].start)<new Date(list[i-1].end)){conflicts.add(list[i].id);conflicts.add(list[i-1].id);}}
 const step=zoom>=4?1:zoom>=2?2:zoom>=1?4:6;
 const rowWidth=days*dayWidth;
 const laneMap=new Map<number,number>();
 const rowHeights=new Map<number,number>();
 for(const p of people){
  const list=visible.filter(s=>s.personId===p.id).sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime()||a.id-b.id);
  const laneEnds:number[]=[];
  for(const s of list){
   const startMs=new Date(s.start).getTime(),endMs=new Date(s.end).getTime();
   let lane=laneEnds.findIndex(lastEnd=>lastEnd<=startMs);
   if(lane<0){lane=laneEnds.length;laneEnds.push(endMs);}else laneEnds[lane]=endMs;
   laneMap.set(s.id,lane);
  }
  rowHeights.set(p.id,Math.max(72,16+laneEnds.length*54));
 }
 const blocks=(p:number)=>visible.filter(s=>s.personId===p).map(s=>{
  const begin=localDate(s.start),finish=localDate(s.end);
  const startIndex=dates.indexOf(begin),endIndex=dates.indexOf(finish);
  const x=startIndex<0?(begin<anchor?0:rowWidth):startIndex*dayWidth+mins(s.start)/1440*dayWidth;
  const right=endIndex<0?(finish<anchor?0:rowWidth):endIndex*dayWidth+mins(s.end)/1440*dayWidth;
  const width=Math.max(4,Math.min(rowWidth-x,right-x));
  if(x>=rowWidth||right<=0)return null;
  const laneTop=8+(laneMap.get(s.id)||0)*54;
  const travelBlock=(direction:'before'|'after',minutes:number|null)=>{
   if(!travel||!minutes||minutes<=0||minutes>720)return null;
   const pixels=minutes/1440*dayWidth;
   const left=direction==='before'?x-pixels:right;
   const clippedLeft=Math.max(0,left),clippedRight=Math.min(rowWidth,left+pixels);
   if(clippedRight<=clippedLeft)return null;
   return <button key={s.id+'-'+direction} type="button" onClick={()=>setSelected(s)} title={(direction==='before'?'Heenreis':'Terugreis')+' · '+minutes+' minuten · '+(s.projectName||s.name)} className={styles.block} style={{left:clippedLeft,width:clippedRight-clippedLeft,top:laneTop,backgroundColor:'#cbd5e1',border:'1px dashed #64748b',zIndex:1}}><span>{direction==='before'?'↗ Heen':'↙ Terug'}</span><small>{minutes} min</small></button>;
  };
  return <div key={s.id}>{travelBlock('before',s.travelBeforeMinutes)}<button type="button" title={(s.projectName||s.name)+' · '+fmt(s.start)+' – '+fmt(s.end)} onClick={()=>setSelected(s)} className={styles.block+(conflicts.has(s.id)?' '+styles.conflict:'')} style={{left:x,width,top:laneTop,backgroundColor:colorFor(s.name),zIndex:2}}><span>{s.projectName||s.name}</span><small>{s.name} · {fmt(s.start).split(', ').pop()}</small></button>{travelBlock('after',s.travelAfterMinutes)}</div>;
 });
 return <main className={styles.page}>
  <header className={styles.header}><div><h1>Personeelstijdlijn</h1><p>Medewerkers en diensten · Rentman-planning</p></div><div className={styles.actions}><button onClick={()=>setAnchor(add(anchor,-days))} aria-label="Vorige periode"><ArrowLeft size={16}/></button><button onClick={()=>setAnchor(today)}>Vandaag</button><button onClick={()=>setAnchor(add(anchor,days))} aria-label="Volgende periode"><ArrowRight size={16}/></button><select value={view} onChange={e=>setView(e.target.value as View)}><option value="day">Dag</option><option value="three">3 dagen</option><option value="week">Week</option></select><button onClick={()=>setRotated(!rotated)}><RotateCcw size={15}/> Draai weergave</button><button onClick={()=>{zoomRef.current=Math.max(.5,zoom-.25);setZoom(zoomRef.current);}} aria-label="Uitzoomen">−</button><span title="Houd Shift ingedrukt en scroll om de tijdlijn te zoomen">{Math.round(zoom*100)}% · Shift + scroll</span><button onClick={()=>{zoomRef.current=Math.min(8,zoom+.25);setZoom(zoomRef.current);}} aria-label="Inzoomen">+</button></div></header>
  <div className={styles.filters}><label><Search size={16}/><input placeholder="Zoek medewerker..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select value={role} onChange={e=>setRole(e.target.value)}><option value="all">Alle functies</option>{roles.map(r=><option key={r}>{r}</option>)}</select><label className={styles.check}><input type="checkbox" checked={travel} onChange={e=>setTravel(e.target.checked)}/> Reistijd tonen</label><button className={styles.legendButton} onClick={()=>setEditFunctions(!editFunctions)}>{editFunctions?'Functiefilter sluiten':'Functies filteren & sorteren'}</button><button className={styles.legendButton} onClick={()=>setEditLegend(!editLegend)}>{editLegend?'Legenda sluiten':'Legenda aanpassen'}</button><span className={styles.legend}><b>● Conflict</b></span></div>
  {editFunctions&&<section className={styles.legendEditor}><div className={styles.legendIntro}><strong>Rentman-functies filteren en volgorde bepalen</strong><span>Vink functies aan om diensten te tonen. De volgorde bepaalt ook de volgorde van medewerkers op de tijdlijn. Instellingen blijven in deze browser bewaard.</span></div><div className={styles.functionControls}><button onClick={()=>persistFunctions([],functionOrder)}>Alles tonen</button><button onClick={()=>persistFunctions([...functionNames],functionOrder)}>Alles verbergen</button><button onClick={()=>persistFunctions([],[])}>Standaard herstellen</button></div><div className={styles.functionList}>{orderedFunctions.map((name,index)=><div key={name} className={styles.functionRow}><label><input type="checkbox" checked={!hiddenFunctions.includes(name)} onChange={e=>persistFunctions(e.target.checked?hiddenFunctions.filter(x=>x!==name):[...hiddenFunctions,name],functionOrder)}/><span className={styles.functionDot} style={{backgroundColor:colorFor(name)}}/>{name}</label><div><button disabled={index===0} onClick={()=>moveFunction(name,-1)} aria-label={name+' omhoog'} title="Omhoog">↑</button><button disabled={index===orderedFunctions.length-1} onClick={()=>moveFunction(name,1)} aria-label={name+' omlaag'} title="Omlaag">↓</button></div></div>)}</div></section>}
  {editLegend&&<section className={styles.legendEditor}><div className={styles.legendIntro}><strong>Functiekleuren</strong><span>Kies per Rentman-functie een kleur. Je keuze wordt in deze browser bewaard.</span></div><div className={styles.legendItems}>{functionNames.map(name=><label key={name} className={styles.legendItem}><input type="color" value={colorFor(name)} onChange={e=>setFunctionColor(name,e.target.value)} aria-label={'Kleur voor '+name}/><span>{name}</span></label>)}</div><button className={styles.legendReset} onClick={()=>{setColors({});try{window.localStorage.removeItem(colorKey);}catch{}}}>Standaardkleuren herstellen</button></section>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.content}><div className={styles.timeline}>
  {!rotated?<div className={styles.scroll} ref={scrollRef}><div className={styles.grid} style={{width:220+rowWidth}}>
   <div className={styles.stickyHead}><div className={styles.corner}>Medewerker</div><div className={styles.days} style={{width:rowWidth}}>{dates.map(d=><div key={d} className={styles.day} style={{width:dayWidth,minWidth:dayWidth}}><strong>{dayLabel(d)}</strong><div className={styles.hours}>{Array.from({length:24/step},(_,i)=><span key={i}>{String(i*step).padStart(2,'0')}:00</span>)}</div></div>)}</div></div>
   {people.map(p=><div className={styles.line} key={p.id} style={{height:rowHeights.get(p.id)||72}}><div className={styles.person}><strong>{p.name}</strong><small>{p.role}</small></div><div className={styles.track} style={{width:rowWidth,backgroundSize:(dayWidth/24)+'px 100%'}}>{blocks(p.id)}</div></div>)}
  </div></div>:<div className={styles.scroll}><div className={styles.rotated} style={{minWidth:Math.max(660,100+people.length*160)}}><div className={styles.rotateHead}><span>Tijd</span>{people.map(p=><strong key={p.id}>{p.name}</strong>)}</div>{dates.map(date=><section key={date}><h3>{dayLabel(date)}</h3><div className={styles.rotateRows}><div className={styles.timeAxis}>{Array.from({length:13},(_,i)=><span key={i}>{String(i*2).padStart(2,'0')}:00</span>)}</div>{people.map(p=><div className={styles.verticalTrack} key={p.id}>{visible.filter(s=>s.personId===p.id&&localDate(s.start)===date).map(s=><button key={s.id} onClick={()=>setSelected(s)} className={styles.verticalBlock} style={{top:mins(s.start)/1440*576,height:Math.max(20,(new Date(s.end).getTime()-new Date(s.start).getTime())/DAY*576),backgroundColor:colorFor(s.name)}}>{s.name}</button>)}</div>)}</div></section>)}</div></div>}
  {people.length===0&&<p className={styles.empty}>Geen medewerkers gevonden voor deze selectie.</p>}</div>
  <aside className={styles.side}>{selected?<><div className={styles.sideTitle}><div><span className={styles.eyebrow}>DIENSTDETAILS</span><h2>{selected.name}</h2></div><button onClick={()=>setSelected(null)}>Sluiten</button></div>
  <div className={styles.detailHero}><strong>{selected.projectName||'Projectgegevens niet beschikbaar'}</strong><span>{selected.projectNumber?'Project #'+selected.projectNumber:selected.projectId?'Rentman ID '+selected.projectId:'Geen project gekoppeld'}</span></div>
  <section className={styles.detailSection}><h3>Personeel & functie</h3><dl><dt>Medewerker</dt><dd>{selected.person}</dd><dt>Functie</dt><dd>{selected.role}</dd><dt>Soort dienst</dt><dd>{classify(selected.name)==='travel'?'Reistijd':'Werktijd'}</dd></dl></section>
  <section className={styles.detailSection}><h3>Tijdschema</h3><dl><dt>Start</dt><dd>{fmt(selected.start)}</dd><dt>Einde</dt><dd>{fmt(selected.end)}</dd><dt>Duur gepland</dt><dd>{Math.round((new Date(selected.end).getTime()-new Date(selected.start).getTime())/60000)/60} uur</dd><dt>Reis heen</dt><dd>{selected.outbound?'In Rentman aangevinkt':'Niet aangevinkt'}</dd><dt>Reis terug</dt><dd>{selected.returnTrip?'In Rentman aangevinkt':'Niet aangevinkt'}</dd><dt>Reisduur</dt><dd>Niet beschikbaar in de personeelsgegevens</dd><dt>Registratie</dt><dd>Nog niet gekoppeld</dd></dl></section>
  <section className={styles.detailSection}><h3>Project & locatie</h3><dl><dt>Opdrachtgever</dt><dd>{selected.customer||'Niet beschikbaar'}</dd><dt>Subproject</dt><dd>{selected.subprojectName||'Niet beschikbaar'}</dd><dt>Locatie</dt><dd>{selected.location||'Niet beschikbaar'}</dd><dt>Adres</dt><dd>{selected.address||'Niet beschikbaar'}</dd></dl>{selected.address&&<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(selected.address)} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> Open in Google Maps</a>}</section>
  {conflicts.has(selected.id)&&<p className={styles.error}><AlertTriangle size={15}/> Deze dienst overlapt een andere dienst van dezelfde medewerker.</p>}
  {selected.projectId&&<Link className={styles.projectLink} href={'/planning?project='+selected.projectId}><ExternalLink size={15}/> Naar projectplanning</Link>}
  <button className={styles.whatsapp} onClick={()=>{const msg=[selected.person,selected.projectName||selected.name,selected.projectNumber?'Project #'+selected.projectNumber:'',selected.role,fmt(selected.start)+' – '+fmt(selected.end),selected.address||selected.location||''].filter(Boolean).join('\n');window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');}}>Deel briefing via WhatsApp</button>
 </>:<><h2>Planningsoverzicht</h2><p>Klik op een dienst om de details te bekijken.</p><div className={styles.metric}><Clock size={18}/> {visible.length} diensten in deze periode</div><div className={styles.metric}><AlertTriangle size={18}/> {conflicts.size} overlappende diensten</div><div className={styles.metric}><MapPin size={18}/> Reisblokken apart gemarkeerd</div></>}</aside></div>
  <footer className={styles.footer}><div><strong>Open shifts</strong><p>Te koppelen aan de bestaande Open Shifts-module.</p></div><div><strong>Beschikbare medewerkers</strong><p>Vrije tijd is niet automatisch bevestigde beschikbaarheid.</p></div><div><strong>Route & reistijd</strong><p>Integratie met de bestaande routemodule volgt.</p></div></footer>
 </main>;
}
