'use client';
import { useState, useTransition } from 'react';
import { BadgeEuro, ClipboardCheck } from 'lucide-react';
import { updateRecurringTaskSetting } from '@/app/planning/actions';
import { useToast } from './ToastProvider';

type TaskConfig={title?:string;active?:boolean;task_area?:'office'|'warehouse'|'both';weekday?:number};
const weekdays=[[1,'Maandag'],[2,'Dinsdag'],[3,'Woensdag'],[4,'Donderdag'],[5,'Vrijdag'],[6,'Zaterdag'],[7,'Zondag']] as const;

export default function RecurringTasksSettings({closing,billing}:{closing:TaskConfig;billing:TaskConfig}){
  const [editing,setEditing]=useState<'closing'|'billing'|null>(null); const [pending,startTransition]=useTransition(); const {showToast}=useToast();
  function save(formData:FormData){startTransition(async()=>{const result=await updateRecurringTaskSetting(formData);if(result?.ok){showToast(result.message||'Wijzigingen opgeslagen.');setEditing(null)}else showToast(result?.message||'Opslaan is niet gelukt.','error')})}
  const rows=[
    {key:'closing' as const,icon:ClipboardCheck,title:closing.title||'Afsluitlijst afronden',meta:'Ma–vr · gekoppeld aan Afsluitlijst',config:closing},
    {key:'billing' as const,icon:BadgeEuro,title:billing.title||'Facturatie',meta:`Wekelijks · ${weekdays.find(([d])=>d===Number(billing.weekday??3))?.[1]??'Woensdag'}`,config:billing},
  ];
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
  </article>)}</div>
}
