'use client';
import Link from 'next/link';
import { ClipboardCheck, ListChecks, Monitor, Repeat2, Settings2, Users } from 'lucide-react';

const items=[
  {key:'general',href:'/planning/instellingen',label:'Algemeen',icon:Settings2},
  {key:'recurring',href:'/planning/instellingen#terugkerende-taken',label:'Terugkerende taken',icon:Repeat2},
  {key:'checklists',href:'/planning/templates',label:'Checklists',icon:ListChecks},
  {key:'closing',href:'/planning/afsluitlijst/beheer',label:'Afsluitlijst',icon:ClipboardCheck},
  {key:'users',href:'/admin/users',label:'Gebruikers & rechten',icon:Users},
  {key:'tv',href:'/planning/tv',label:'TV-weergave',icon:Monitor},
] as const;

export default function SettingsNav({active}:{active:string}) {
  return <aside className="settingsLocalNav"><div className="settingsLocalNavTitle">Instellingen</div>{items.map(item=>{const Icon=item.icon;return <Link href={item.href} className={active===item.key?'active':''} key={item.key}><span className="settingsNavItemMain"><Icon size={16} strokeWidth={1.9}/>{item.label}</span><span>›</span></Link>})}</aside>;
}
