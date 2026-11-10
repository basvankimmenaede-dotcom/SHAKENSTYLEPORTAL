import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import {LockKeyhole,MailCheck,KeyRound,ShieldCheck,UsersRound} from 'lucide-react';
export default async function PortalSecuritySettingsPage(){
 await requireAdmin();
 const items=[
  {title:'Accounts & rollen',desc:'Bekijk klantaccounts en interne accounts gescheiden. Beheer rollen en toegang per module.',href:'/admin/intern/rollen',icon:UsersRound},
  {title:'Uitnodigingen & activatie',desc:'Bekijk openstaande uitnodigingen en stuur de activatie opnieuw naar gebruikers.',href:'/admin/intern/uitnodigingen',icon:MailCheck},
  {title:'Accountbeheer & reset',desc:'Reset het wachtwoord van een bestaand account of controleer de laatste inlogdatum.',href:'/admin/intern/inloggen',icon:KeyRound},
  {title:'Crew-loginstatus',desc:'Bekijk apart of een medewerker actief is in Rentman en of zijn portaalaccount bestaat.',href:'/admin/personeel/inloggen',icon:ShieldCheck}
 ];
 return <SettingsWorkspace active="security" title="Login & beveiliging"
  description="Eén ingang naar uitnodigingen, activatie, wachtwoordbeheer en toegangsrechten.">
  <section className="settingsPanel accessSettingsPanel">
   <header className="settingsPanelHeader"><div><span>Toegangsbeheer</span><h2>Login & accounts</h2>
    <p>Accountrechten blijven in het bestaande gebruikersbeheer. Hier vind je alle ingangen.</p></div></header>
   <div className="accessSettingsGrid">{items.map(item=>{
     const Icon=item.icon;return <Link href={item.href} key={item.title} className="accessSettingsTile">
      <Icon size={22}/><strong>{item.title}</strong><span>{item.desc}</span><small>Openen →</small>
     </Link>;
   })}</div>
  </section>
  <section className="settingsPanel accessSettingsPanel">
    <header className="settingsPanelHeader"><div><span>Inlogportalen</span><h2>Bestaande toegang</h2></div></header>
    <div className="accessSettingsGrid">
      <Link className="accessSettingsTile" href="/login"><LockKeyhole size={22}/><strong>Klanten & interne accounts</strong><span>Supabase Auth met wachtwoord, activatie en wachtwoordreset.</span><small>Login bekijken →</small></Link>
      <Link className="accessSettingsTile" href="/crew"><UsersRound size={22}/><strong>Crewportaal</strong><span>Afzonderlijke login met controle op een gekoppeld, actief crewprofiel.</span><small>Crewlogin bekijken →</small></Link>
    </div>
  </section>
  </SettingsWorkspace>;
}
