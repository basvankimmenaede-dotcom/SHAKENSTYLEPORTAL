'use client';
import Link from 'next/link';
import {ClipboardCheck,ListChecks,Mail,Monitor,Repeat2,Settings2,FileCheck2,ShieldCheck,PlugZap,Bell} from 'lucide-react';
const groups=[
 {label:'Portaalinstellingen',items:[
  {key:'general',href:'/planning/instellingen',label:'Algemeen',icon:Settings2},
  {key:'security',href:'/planning/instellingen/login-beveiliging',label:'Login & beveiliging',icon:ShieldCheck},
  {key:'invoice-email',href:'/planning/instellingen/facturen',label:'E-mail & mailboxen',icon:Mail},
  {key:'invoice-processing',href:'/planning/instellingen/factuurverwerking',label:'Factuurworkflow',icon:FileCheck2},
  {key:'integrations',href:'/planning/instellingen/integraties',label:'Integraties',icon:PlugZap},
  {key:'notifications',href:'/planning/instellingen/notificaties',label:'Notificaties',icon:Bell}
 ]},
 {label:'Planning & werkvloer',items:[
  {key:'recurring',href:'/planning/instellingen/terugkerende-taken',label:'Terugkerende taken',icon:Repeat2},
  {key:'checklists',href:'/planning/templates',label:'Checklists',icon:ListChecks},
  {key:'closing',href:'/planning/afsluitlijst/beheer',label:'Afsluitlijst',icon:ClipboardCheck},
  {key:'tv',href:'/planning/tv',label:'TV-weergave',icon:Monitor}
 ]}
] as const;
export default function SettingsNav({active}:{active:string}){
 return <aside className="settingsLocalNav">
  {groups.map(group=><div className="settingsNavGroup" key={group.label}>
    <div className="settingsLocalNavTitle">{group.label}</div>
    {group.items.map(item=>{
      const Icon=item.icon;
      return <Link href={item.href} className={active===item.key?'active':''} key={item.key}>
        <span className="settingsNavItemMain"><Icon size={16} strokeWidth={1.9}/>{item.label}</span><span>›</span>
      </Link>;
    })}
  </div>)}
 </aside>;
}
