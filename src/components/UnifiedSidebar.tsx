'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {
  BadgeEuro,Boxes,ReceiptText,Building2,CalendarClock,CalendarDays,
  CheckSquare2,ChevronDown,ClipboardCheck,Gauge,PackageSearch,Route,
  Settings,SlidersHorizontal,Users,UserRoundCog,ShieldCheck,
  KeyRound,Mail,Clock3,UserCheck,BriefcaseBusiness,ContactRound,
  FileCheck2,Repeat2,Monitor,ListChecks
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';

type NavItem={href:string;label:string;icon:LucideIcon;exact?:boolean};
type NavGroup={label:string;icon:LucideIcon;items:NavItem[];key:string};
export default function UnifiedSidebar({
  mode,role,userLabel,canViewPortal=false,canViewPlanning=false,
  canViewBilling=false,canViewChecklists=false
}:{
  mode:'admin'|'planning'|'portal';role:'admin'|'warehouse'|'customer';
  userLabel?:string|null;canViewPortal?:boolean;canViewPlanning?:boolean;
  canViewBilling?:boolean;canViewChecklists?:boolean;
}){
  const pathname=usePathname();
  void mode;
  const admin=role==='admin';
  const planning:NavItem[]=[
    ...(canViewPlanning||admin?[
      {href:'/planning',label:'Planning',icon:CalendarDays,exact:true},
      {href:'/planning/open-shifts',label:'Open diensten',icon:CalendarClock},
      {href:'/planning/rentman-wijzigingen',label:'Rentman wijzigingen',icon:SlidersHorizontal}
    ]:[]),
    ...(canViewChecklists||admin?[
      {href:'/planning/afsluitlijst',label:'Afsluitlijst',icon:ClipboardCheck,exact:true}
    ]:[])
  ];
  const groups:NavGroup[]=[
    ...(planning.length?[{key:'planning',label:'Planning',icon:CalendarDays,items:planning}]:[]),
    ...(canViewBilling||admin?[{key:'finance',label:'Financiën',icon:BadgeEuro,items:[
      {href:'/planning/billing',label:'Facturatie',icon:BadgeEuro},
      {href:'/planning/crew-invoices',label:'Inkomende facturen',icon:ReceiptText}
    ]}]:[]),
    ...(admin?[{
      key:'personnel',label:'Personeel',icon:Users,items:[
        {href:'/admin/personeel',label:'Overzicht',icon:Gauge,exact:true},
        {href:'/admin/users/crew',label:'Crewprofielen',icon:UserRoundCog},
        {href:'/admin/personeel/inloggen',label:'Crew-loginstatus',icon:KeyRound},
        {href:'/admin/personeel/tarieven',label:'Tarieven & contracturen',icon:Clock3}
      ]
    },{
      key:'customers',label:'Klanten',icon:Building2,items:[
        {href:'/admin/klanten',label:'Overzicht',icon:Gauge,exact:true},
        {href:'/admin/klanten/accounts',label:'Klantaccounts',icon:ContactRound},
        {href:'/admin/distributors',label:'Organisaties',icon:Building2},
        {href:'/admin/brands',label:'Merken & materialen',icon:Boxes}
      ]
    },{
      key:'internal',label:'Intern',icon:BriefcaseBusiness,items:[
        {href:'/admin/intern',label:'Overzicht',icon:Gauge,exact:true},
        {href:'/admin/intern/accounts',label:'Interne accounts',icon:UserRoundCog},
        {href:'/admin/intern/rollen',label:'Rollen & rechten',icon:ShieldCheck},
        {href:'/admin/intern/uitnodigingen',label:'Uitnodigingen',icon:Mail},
        {href:'/admin/intern/inloggen',label:'Login & beveiliging',icon:KeyRound}
      ]
    },{
      key:'settings',label:'Portaalinstellingen',icon:Settings,items:[
        {href:'/planning/instellingen',label:'Algemeen',icon:Settings,exact:true},
        {href:'/planning/instellingen/login-beveiliging',label:'Login & beveiliging',icon:ShieldCheck},
        {href:'/planning/instellingen/facturen',label:'E-mail & mailboxen',icon:Mail},
        {href:'/planning/instellingen/factuurverwerking',label:'Factuurworkflow',icon:FileCheck2},
        {href:'/planning/instellingen/integraties',label:'Integraties',icon:SlidersHorizontal},
        {href:'/planning/instellingen/notificaties',label:'Notificaties',icon:Mail},
        {href:'/planning/instellingen/terugkerende-taken',label:'Terugkerende taken',icon:Repeat2},
        {href:'/planning/templates',label:'Checklists',icon:ListChecks},
        {href:'/planning/afsluitlijst/beheer',label:'Afsluitlijst beheer',icon:ClipboardCheck},
        {href:'/planning/tv',label:'TV-weergave',icon:Monitor}
      ]
    }]:[])
  ];
  const isActive=(item:NavItem)=>item.exact
    ?pathname===item.href:pathname===item.href||pathname.startsWith(item.href+'/');
  const link=(item:NavItem)=>{
    const Icon=item.icon;
    return <Link href={item.href} className={'uiSidebarLink'+(isActive(item)?' active':'')} key={item.href}>
      <span className="uiSidebarIcon"><Icon size={16} strokeWidth={1.9}/></span>
      <span>{item.label}</span>
    </Link>;
  };
  const homeHref=admin?'/admin/accounts':canViewPlanning?'/planning':canViewPortal?'/portal':'/account';
  const portalLabel=role==='warehouse'?'POS Portaal':admin?'Klantenportaal bekijken':'Klantenportaal';
  return <aside className="uiSidebar">
    <div className="uiSidebarBrand"><Link href={homeHref} aria-label="SHAKENSTYLE home"><BrandLogo compact/></Link></div>
    <nav className="uiSidebarNav" aria-label="Hoofdnavigatie">
      {admin?link({href:'/admin',label:'Dashboard',icon:Gauge,exact:true}):null}
      {admin?link({href:'/admin/accounts',label:'Accounts & toegang',icon:Users,exact:true}):null}
      {groups.map(group=>{
        const Icon=group.icon;
        const open=group.items.some(isActive)||
          (group.key==='internal'&&pathname.startsWith('/admin/users')&&!pathname.startsWith('/admin/users/crew'));
        return <details key={group.key} className={'uiSidebarGroup uiSidebarAreaGroup'+(open?' selected':'')} open={open||undefined}>
          <summary><span><Icon size={16} strokeWidth={1.9}/>{group.label}</span><ChevronDown size={14}/></summary>
          <div className="uiSidebarGroupItems">{group.items.map(link)}</div>
        </details>;
      })}
      {canViewPlanning||admin?link({href:'/planning/logistics',label:'Logistiek',icon:Route}):null}
      {canViewPortal||admin?link({href:'/portal',label:portalLabel,icon:PackageSearch}):null}
      {!groups.length&&!canViewPortal&&!admin?link({href:'/account',label:'Mijn account',icon:CheckSquare2}):null}
    </nav>
    <div className="uiSidebarFooter">
      <Link href="/account" className={pathname==='/account'?'uiSidebarAccount active':'uiSidebarAccount'}>
        <span className="uiSidebarAvatar">{(userLabel||'S').trim().slice(0,1).toUpperCase()}</span>
        <span><strong>{userLabel||'SHAKENSTYLE'}</strong><small>Mijn account</small></span>
      </Link>
      <LogoutButton/>
    </div>
  </aside>;
}
