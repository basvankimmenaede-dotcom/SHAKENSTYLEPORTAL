import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import SettingsNav from '@/components/SettingsNav';
import CrewMemberManager from '@/app/crew/admin/ui/CrewMemberManager';

export const dynamic='force-dynamic';

export default async function UsersSettingsPage(){
 await requireAdmin();
 const {data:members,error}=await createAdminClient().from('crew_portal_members')
 .select('id,rentman_crew_id,full_name,email,rentman_email,login_email_override,active,last_synced_at')
 .eq('portal_deleted',false).order('full_name');
 return <main className="container settingsPage">
  <section className="usersAdminHeader"><div><span className="usersAdminEyebrow">Beheer</span><h1>Gebruikersbeheer</h1><p>Medewerkers, klanten en toegangsrechten vanuit één centrale plek.</p></div><Link className="button secondary" href="/planning/instellingen">Terug naar instellingen</Link></section>
  <section className="settingsWorkspace"><SettingsNav active="users"/><div className="settingsEditorPane settingsMain">
   <section className="settingsPanel"><header className="settingsPanelHeader"><div><span>Personeel</span><h2>Medewerkers</h2><p>Synchroniseer met Rentman, beheer toegang of verwijder medewerkers uit de portal.</p></div></header>
   {error?<div className="notice">Medewerkers konden niet worden geladen.</div>:<CrewMemberManager members={members||[]}/>}</section>
   <section className="settingsPanel"><header className="settingsPanelHeader"><div><span>Klanten en toegangsbeheer</span><h2>Klanten, rollen & rechten</h2><p>Beheer klantaccounts, organisaties en de toegangsrechten van gebruikers.</p></div></header>
   <div className="settingsInlineLinks"><Link href="/admin/users"><strong>Open klanten- en rechtenadministratie</strong><span>Gebruikersgegevens, organisaties en rollen beheren.</span><b>Openen →</b></Link></div></section>
  </div></section>
 </main>;
}
