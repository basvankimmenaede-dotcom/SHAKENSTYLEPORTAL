'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeEuro, Boxes, Building2, CalendarClock, CalendarDays, CheckSquare2, ClipboardCheck, Gauge, PackageSearch, Settings, SlidersHorizontal, Users } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';

type NavItem = { href:string; label:string; icon:React.ComponentType<{size?:number;strokeWidth?:number}>; match?:string[] };

export default function UnifiedSidebar({ mode, role, userLabel, canViewPortal=false, canViewPlanning=false, canViewBilling=false, canViewChecklists=false }:{
  mode:'admin'|'planning'|'portal'; role:'admin'|'warehouse'|'customer'; userLabel?:string|null;
  canViewPortal?:boolean; canViewPlanning?:boolean; canViewBilling?:boolean; canViewChecklists?:boolean;
}) {
  const pathname=usePathname(); void mode;
  const portalLabel=role==='warehouse'?'POS Portaal':'Klantenportaal';
  const internalItems:NavItem[]=[
    ...(canViewPlanning?[{href:'/planning',label:'Planning',icon:CalendarDays,match:['/planning']},
    {href:'/planning/open-shifts',label:'Open shifts',icon:CalendarClock,match:['/planning/open-shifts']},{href:'/planning/open-shifts',label:'Open shifts',icon:CalendarClock,match:['/planning/open-shifts']}]:[]),
    ...(canViewBilling?[{href:'/planning/billing',label:'Facturatie',icon:BadgeEuro,match:['/planning/billing']}]:[]),
    ...(canViewChecklists?[{href:'/planning/afsluitlijst',label:'Afsluitlijst',icon:ClipboardCheck,match:['/planning/afsluitlijst']}]:[]),
    ...(canViewPlanning?[{href:'/planning/rentman-wijzigingen',label:'Rentman wijzigingen',icon:SlidersHorizontal,match:['/planning/rentman-wijzigingen']}]:[]),
    ...(canViewPortal?[{href:'/portal',label:portalLabel,icon:PackageSearch,match:['/portal']}]:[]),
  ];
  const items:NavItem[]=role==='admin'?[
    {href:'/admin',label:'Dashboard',icon:Gauge,match:['/admin']},
    {href:'/planning',label:'Planning',icon:CalendarDays,match:['/planning']},
    {href:'/planning/billing',label:'Facturatie',icon:BadgeEuro,match:['/planning/billing']},
    {href:'/planning/afsluitlijst',label:'Afsluitlijst',icon:ClipboardCheck,match:['/planning/afsluitlijst']},
    {href:'/planning/rentman-wijzigingen',label:'Rentman wijzigingen',icon:SlidersHorizontal,match:['/planning/rentman-wijzigingen']},
    {href:'/admin/brands',label:'Merken & materialen',icon:Boxes,match:['/admin/brands']},
    {href:'/admin/distributors',label:'Distributeurs',icon:Building2,match:['/admin/distributors']},
    {href:'/admin/users',label:'Gebruikers & rechten',icon:Users,match:['/admin/users']},
    {href:'/planning/instellingen',label:'Instellingen',icon:Settings,match:['/planning/instellingen','/planning/templates','/planning/afsluitlijst/beheer','/planning/tv']},
    {href:'/portal',label:'Klantenportaal',icon:PackageSearch,match:['/portal']},
  ]:internalItems.length?internalItems:[{href:'/account',label:'Account',icon:CheckSquare2,match:['/account']}];

  function isActive(item:NavItem){ if(item.href==='/admin')return pathname==='/admin'; if(item.href==='/planning')return pathname==='/planning'; return item.match?.some(p=>pathname===p||pathname.startsWith(p+'/'))??false; }
  const homeHref=role==='admin'?'/admin':canViewPlanning?'/planning':canViewPortal?'/portal':'/account';

  return <aside className="uiSidebar">
    <div className="uiSidebarBrand"><Link href={homeHref} aria-label="SHAKENSTYLE home"><BrandLogo compact /></Link></div>
    <nav className="uiSidebarNav">{items.map(item=>{const Icon=item.icon;return <Link href={item.href} className={isActive(item)?'uiSidebarLink active':'uiSidebarLink'} key={item.href}><span className="uiSidebarIcon"><Icon size={17} strokeWidth={1.9}/></span><span>{item.label}</span></Link>})}</nav>
    <div className="uiSidebarFooter">
      <Link href="/account" className={pathname==='/account'?'uiSidebarAccount active':'uiSidebarAccount'}><span className="uiSidebarAvatar">{(userLabel||'S').trim().slice(0,1).toUpperCase()}</span><span><strong>{userLabel||'SHAKENSTYLE'}</strong><small>Account</small></span></Link>
      <LogoutButton />
    </div>
  </aside>;
}
