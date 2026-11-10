import Link from 'next/link';
import {getAccountDirectoryCounts} from '@/lib/account-directory';
import {requireAdmin} from '@/lib/auth';
import {
  UsersRound,UserRoundCog,Building2,CalendarDays,ReceiptText,Clock3,ShieldCheck,
  Mail,LockKeyhole,FileText,BriefcaseBusiness,Boxes,Settings,ArrowUpRight,
  ClipboardList,UserCheck,KeyRound,ContactRound
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

type Area='all'|'personnel'|'customers'|'internal';
type Destination={name:string;desc:string;href:string;icon:LucideIcon};
type Group={label:string;desc:string;url:string;icon:LucideIcon;entries:Destination[]};
const sections:Record<'personnel'|'customers'|'internal',Group>={
 personnel:{label:'Personeel',desc:'Bartenders, crewtoegang, diensten, uren en crewfacturen.',url:'/admin/personeel',icon:UsersRound,entries:[
  {name:'Crewprofielen',desc:'Rentman-status, bedrijf en factuur e-mailadres per medewerker.',href:'/admin/users/crew',icon:UserRoundCog},
  {name:'Diensten & uren',desc:'Planning, crewshifts en geregistreerde uren.',href:'/planning',icon:CalendarDays},
  {name:'Crewfacturen',desc:'Facturen ontvangen, koppelen, controleren en goedkeuren.',href:'/planning/crew-invoices',icon:ReceiptText},
  {name:'Tarieven & contracturen',desc:'Contracturen, tariefbronnen en de financiële koppeling.',href:'/admin/personeel/tarieven',icon:Clock3},
  {name:'Crew-loginstatus',desc:'Controle van Rentman, portaalaccount en handmatige blokkades.',href:'/admin/personeel/inloggen',icon:KeyRound},
  {name:'Open diensten',desc:'Beschikbare diensten en personeelsplanning.',href:'/planning/open-shifts',icon:ClipboardList}
 ]},
 customers:{label:'Klanten',desc:'Klantbedrijven, contactpersonen, merken en portaaltoegang.',url:'/admin/klanten',icon:Building2,entries:[
  {name:'Klantaccounts',desc:'Contactpersonen, uitnodigingen, loginstatus en merktoegang.',href:'/admin/klanten/accounts',icon:ContactRound},
  {name:'Organisaties',desc:'Distributeurs en hun gekoppelde merken.',href:'/admin/distributors',icon:Building2},
  {name:'Merken & materialen',desc:'Welke mappen en merken in het klantportaal zichtbaar zijn.',href:'/admin/brands',icon:Boxes},
  {name:'Klantenportaal',desc:'De daadwerkelijke klantweergave en materialen.',href:'/portal',icon:FileText},
  {name:'Toegangsrechten',desc:'Merktoegang en portaalrechten per klantaccount.',href:'/admin/klanten/accounts',icon:ShieldCheck}
 ]},
 internal:{label:'Intern',desc:'Kantoor- en magazijnaccounts, rollen en beveiliging.',url:'/admin/intern',icon:BriefcaseBusiness,entries:[
  {name:'Interne accounts',desc:'Kantoor, magazijn, accountrollen en toegang.',href:'/admin/intern/accounts',icon:UserRoundCog},
  {name:'Rollen & rechten',desc:'Rechten per module voor alle accounttypen.',href:'/admin/intern/rollen',icon:ShieldCheck},
  {name:'Uitnodigingen & activatie',desc:'Uitnodigingen opnieuw versturen en activatie volgen.',href:'/admin/intern/uitnodigingen',icon:Mail},
  {name:'Login & beveiliging',desc:'Wachtwoordresets, accountstatus en accountbeveiliging.',href:'/admin/intern/inloggen',icon:LockKeyhole},
  {name:'Portaalinstellingen',desc:'Centrale instellingen, mailboxen, AI en factuurworkflow.',href:'/planning/instellingen',icon:Settings},
  {name:'Factuurgoedkeurders',desc:'Twee goedkeurders en het boekhoudadres.',href:'/planning/instellingen/factuurverwerking',icon:UserCheck}
 ]}
};

export default async function AccessAreaHub({area='all'}:{area?:Area}){
 await requireAdmin();
 const accountStats=await getAccountDirectoryCounts();
 const groups=area==='all'?Object.values(sections):[sections[area]];
 const metrics=[
  {name:'Crewprofielen',value:accountStats.crew,desc:accountStats.crewActive+' actief in Rentman'},
  {name:'Klantaccounts',value:accountStats.customers,desc:accountStats.organizations+' klantorganisaties'},
  {name:'Interne accounts',value:accountStats.internal,desc:'kantoor en magazijn'}
 ];
 return <main className="container accessAreasPage">
  <section className="usersAdminHeader">
   <div><span className="usersAdminEyebrow">SHAKENSTYLE Portal / Gebruikers & toegang</span>
    <h1>{area==='all'?'Accounts & toegang':sections[area].label}</h1>
    <p>{area==='all'?'Klanten, personeel en interne accounts hebben elk hun eigen beheeromgeving. Crewlogins zijn gescheiden van klantaccounts, ook bij een oude technische Customer-rol.':sections[area].desc}</p>
   </div>
   {area==='all'?<Link className="button secondary" href="/admin/users">Alle accounts</Link>:
    <Link className="button secondary" href="/admin/accounts">Alle accountgroepen</Link>}
  </section>
  <section className="accessAreaMetrics">{metrics.map(m=><div className="accessAreaMetric" key={m.name}>
   <span>{m.name}</span><strong>{m.value??'—'}</strong><small>{m.desc}</small>
  </div>)}</section>
  {area==='all'&&accountStats.unlinked>0?<div className="accessAreaWarning">{accountStats.unlinked} account(s) zonder crew- of organisatiekoppeling. Controleer deze onder <Link href="/admin/intern/inloggen">Login & beveiliging</Link>.</div>:null}
  <div className="accessAreasGroups">{groups.map(group=>{
    const Icon=group.icon;
    return <section className={'accessAreaGroup '+(group.label==='Personeel'?'personnel':group.label==='Klanten'?'customer':'internal')} key={group.label}>
     <header className="accessAreaGroupHead">
      <span className="accessAreaGroupIcon"><Icon size={21} strokeWidth={1.8}/></span>
      <div><h2>{group.label}</h2><p>{group.desc}</p></div>
      {area==='all'?<Link href={group.url}>Open overzicht <ArrowUpRight size={15}/></Link>:null}
     </header>
     <div className="accessAreaLinks">{group.entries.map(entry=>{
      const EntryIcon=entry.icon;
      return <Link className="accessAreaLink" href={entry.href} key={entry.href+entry.name}>
       <span className="accessAreaLinkIcon"><EntryIcon size={18}/></span>
       <span><strong>{entry.name}</strong><small>{entry.desc}</small></span>
       <ArrowUpRight size={16} className="accessAreaLinkArrow"/>
      </Link>
     })}</div>
    </section>;
  })}</div>
  <section className="accessSettingsShortcut"><Settings size={21}/><div>
   <h2>Portaalinstellingen</h2><p>Algemeen, e-mail en mailboxen, factuurverwerking, integraties, notificaties, checklists en scherminstellingen op één plek.</p>
  </div><Link className="button secondary" href="/planning/instellingen">Open instellingen</Link></section>
 </main>;
}
