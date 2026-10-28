'use client';
import { useState, useTransition } from 'react';
import { BadgeEuro, ClipboardCheck } from 'lucide-react';
import { updateRecurringTaskSetting, saveCustomRecurringTask, removeCustomRecurringTask } from '@/app/planning/actions';
import { useToast } from './ToastProvider';

type CustomTask = { id:string;title:string;active:boolean;task_area:'office'|'warehouse'|'both';frequency:'daily'|'weekdays'|'weekly'|'monthly'|'selected';weekday:number;weekdays:number[];dayOfMonth:number;todoist_task_id?:string|null };
type TaskConfig={title?:string;active?:boolean;task_area?:'office'|'warehouse'|'both';weekday?:number};
const weekdays=[[1,'Maandag'],[2,'Dinsdag'],[3,'Woensdag'],[4,'Donderdag'],[5,'Vrijdag'],[6,'Zaterdag'],[7,'Zondag']] as const;

export default function RecurringTasksSettings({closing,billing,custom=[]}:{closing:TaskConfig;billing:TaskConfig;custom?:CustomTask[]}){
  const [editing,setEditing]=useState<'closing'|'billing'|null>(null);
  const [customEditing,setCustomEditing]=useState<string|null>(null);
  const [frequency,setFrequency]=useState('weekly'); const [pending,startTransition]=useTransition(); const {showToast}=useToast();
  function save(formData:FormData){startTransition(async()=>{const result=await updateRecurringTaskSetting(formData);if(result?.ok){showToast(result.message||'Wijzigingen opgeslagen.');setEditing(null)}else showToast(result?.message||'Opslaan is niet gelukt.','error')})}
  const rows=[
    {key:'closing' as const,icon:ClipboardCheck,title:closing.title||'Afsluitlijst afronden',meta:'Ma–vr · gekoppeld aan Afsluitlijst',config:closing},
    {key:'billing' as const,icon:BadgeEuro,title:billing.title||'Facturatie',meta:`Wekelijks · ${weekdays.find(([d])=>d===Number(billing.weekday??3))?.[1]??'Woensdag'}`,config:billing},
  ];
  function saveCustom(formData:FormData){startTransition(async()=>{const result=await saveCustomRecurringTask(formData);showToast(result.message,result.ok?undefined:'error');if(result.ok){setCustomEditing(null);window.location.reload();}})}
  function removeCustom(id:string){if(!window.confirm('Deze terugkerende taak ook uit Todoist verwijderen?'))return;startTransition(async()=>{const result=await removeCustomRecurringTask(id);showToast(result.message,result.ok?undefined:'error');if(result.ok)window.location.reload();})}
  function customForm(task?:CustomTask){
    return <form action={saveCustom} className="recurringSettingForm" key={task?.id??'new'}>
      {task?<input type="hidden" name="id" value={task.id}/>:null}
      <div className="field"><label>Naam</label><input className="input" name="title" maxLength={180} defaultValue={task?.title??''} required/></div>
      <div className="field"><label>Taaktype</label><select className="select" name="task_area" defaultValue={task?.task_area??'office'}><option value="office">Kantoor</option><option value="warehouse">Magazijn</option><option value="both">Beide</option></select></div>
      <div className="field"><label>Herhaling</label><select className="select" name="frequency" defaultValue={task?.frequency??'weekly'} onChange={event=>setFrequency(event.target.value)}><option value="daily">Dagelijks</option><option value="weekdays">Maandag t/m vrijdag</option><option value="weekly">Wekelijks</option><option value="monthly">Maandelijks</option><option value="selected">Specifieke weekdagen</option></select></div>
      {(task?.frequency??frequency)==='weekly'||frequency==='weekly'?<div className="field"><label>Vaste weekdag</label><select className="select" name="weekday" defaultValue={task?.weekday??1}>{weekdays.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>:null}
      {(task?.frequency??frequency)==='monthly'||frequency==='monthly'?<div className="field"><label>Dag van de maand (1–28)</label><input className="input" type="number" name="dayOfMonth" min={1} max={28} defaultValue={task?.dayOfMonth??1}/></div>:null}
      {(task?.frequency??frequency)==='selected'||frequency==='selected'?<fieldset className="field"><legend>Weekdagen</legend><div style={{display:'flex',flexWrap:'wrap',gap:12}}>{weekdays.map(([v,l])=><label key={v}><input type="checkbox" name="weekdays" value={v} defaultChecked={task?.weekdays?.includes(v)}/>{' '}{l}</label>)}</div></fieldset>:null}
      <label className="recurringActiveControl"><input type="checkbox" name="active" defaultChecked={task?.active!==false}/><span>Actief</span></label>
      <div className="recurringSettingActions"><button type="button" className="button secondary" onClick={()=>setCustomEditing(null)}>Annuleren</button><button type="submit" className="button orange" disabled={pending}>{pending?'Opslaan...':'Opslaan'}</button></div>
    </form>;
  }
  return <div className="recurringSettingsList">{rows.map(({key,icon:Icon,title,meta,config})=><article className="recurringSettingCard" key={key}>
    <div className="recurringSettingIcon"><Icon size={19} strokeWidth={1.9}/></div><div className="recurringSettingMain">
      <div className="recurringSettingTitle"><div><strong>{title}</strong><span>{meta} · {config.task_area==='warehouse'?'Magazijn':config.task_area==='both'?'Beide':'Kantoor'}</span></div><span className={config.active===false?'usersStatusBadge inactive':'usersStatusBadge active'}>{config.active===false?'Inactief':'Actief'}</span></div>
      {editing===key?<form action={save} className="recurringSettingForm"><input type="hidden" name="task_key" value={key}/>
        <div className="field"><label>Naam</label><input className="input" name="title" defaultValue={title} required/></div>
        <div className="field"><label>Taaktype</label><select className="select" name="task_area" defaultValue={config.task_area??(key==='closing'?'both':'office')}><option value="office">Kantoor</option><option value="warehouse">Magazijn</option><option value="both">Beide</option></select></div>
        {key==='billing'?<div className="field"><label>Vaste dag</label><select className="select" name="weekday" defaultValue={Number(config.weekday??3)}>{weekdays.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>:null}
        <label className="recurringActiveControl"><input type="checkbox" name="active" defaultChecked={config.active!==false}/><span>Actief</span></label>
        <div className="recurringSettingActions"><button className="button secondary" type="button" onClick={()=>setEditing(null)}>Annuleren</button><button className="button orange" type="submit" disabled={pending}>{pending?'Opslaan...':'Opslaan'}</button></div>
      </form>:<button className="button secondary compactButton" type="button" onClick={()=>setEditing(key)}>Bewerken</button>}
    </div>
  </article>)}
  <div className="recurringSettingCard" style={{display:'block'}}><h3>Eigen terugkerende taken</h3><p>Nieuwe taken worden in Todoist aangemaakt en keren terug zodra je ze afrondt.</p>
    {custom.map(task=><article key={task.id} style={{padding:'12px 0',borderBottom:'1px solid #e5e7eb'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong>{task.title}</strong><div style={{fontSize:13,color:'#6b7280'}}>{task.frequency} · {task.task_area} · {task.active?'Actief':'Gepauzeerd'}</div></div><div className="recurringSettingActions"><button type="button" className="button secondary" onClick={()=>{setFrequency(task.frequency);setCustomEditing(customEditing===task.id?null:task.id)}}>Bewerken</button><button type="button" className="button secondary" disabled={pending} onClick={()=>removeCustom(task.id)}>Verwijderen</button></div></div>{customEditing===task.id?customForm(task):null}</article>)}
    {customEditing==='new'?customForm():<button type="button" className="button orange" onClick={()=>{setFrequency('weekly');setCustomEditing('new')}}>+ Terugkerende taak toevoegen</button>}
  </div></div>
}
