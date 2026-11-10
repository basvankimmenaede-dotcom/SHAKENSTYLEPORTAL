import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import {Mail,FileCheck2,ClipboardCheck,UserPlus} from 'lucide-react';
export default async function PortalNotificationsSettingsPage(){
 await requireAdmin();
 const smtpReady=Boolean(process.env.CREW_SMTP_HOST&&process.env.CREW_SMTP_USER&&process.env.CREW_SMTP_PASSWORD);
 const items=[
  {title:'Accountuitnodigingen en resetmails',desc:'Activatie, uitnodiging opnieuw versturen en wachtwoordherstel.',href:'/admin/intern/uitnodigingen',icon:UserPlus},
  {title:'Crew shiftrapporten',desc:'Bevestiging na het indienen van een rapport via de crewomgeving.',href:'/admin/personeel',icon:ClipboardCheck},
  {title:'Factuurcorrecties',desc:'Automatische correctieverzoeken naar bartenders vanuit de factuurcontrole.',href:'/planning/crew-invoices',icon:Mail},
  {title:'Goedgekeurde facturen',desc:'Na twee verschillende akkoorden wordt het originele PDF-bestand naar het boekhoudadres gestuurd.',href:'/planning/instellingen/factuurverwerking',icon:FileCheck2}
 ];
 return <SettingsWorkspace active="notifications" title="Notificaties"
  description="Overzicht van bestaande e-mailmomenten en hun beheerlocatie.">
  <section className="settingsPanel accessSettingsPanel">
   <header className="settingsPanelHeader"><div><span>Uitgaande berichten</span><h2>Berichtenstromen</h2>
    <p>SMTP: {smtpReady?'ingesteld, verzending niet getest':'nog niet volledig ingesteld'}. Afzonderlijke notificatievoorkeuren zijn nog niet beschikbaar.</p></div></header>
   <div className="accessSettingsGrid">{items.map(item=>{
    const Icon=item.icon;return <Link className="accessSettingsTile" key={item.title} href={item.href}>
     <Icon size={22}/><strong>{item.title}</strong><span>{item.desc}</span><small>Openen →</small>
    </Link>;
   })}</div>
  </section>
 </SettingsWorkspace>;
}
