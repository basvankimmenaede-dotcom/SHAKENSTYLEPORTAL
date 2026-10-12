import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import SettingsNav from '@/components/SettingsNav';
import CrewMemberManager from '@/app/crew/admin/ui/CrewMemberManager';

export const dynamic='force-dynamic';

export default async function CrewSettingsPage(){
 await requireAdmin();
 const {data,error}=await createAdminClient().from('crew_portal_members')
 .select('id,rentman_crew_id,full_name,email,rentman_email,login_email_override,active,last_synced_at')
 .order('full_name');
 return <main className="container settingsPage">
  <section className="usersAdminHeader"><div><span className="usersAdminEyebrow">Beheer</span><h1>Instellingen</h1><p>Beheer de medewerkers en inlogadressen van de bartenderomgeving.</p></div><Link className="button secondary" href="/planning/instellingen">Terug naar instellingen</Link></section>
  <section className="settingsWorkspace"><SettingsNav active="crew"/><div className="settingsEditorPane settingsMain">
   <section className="settingsPanel"><header className="settingsPanelHeader"><div><span>Personeel</span><h2>Crew beheer</h2><p>Medewerkers komen uit Rentman. Een afwijkend inlogadres wordt niet overschreven bij synchronisatie.</p></div></header>
   {error?<div className="notice">De Crew-databasetabellen zijn nog niet ingericht.</div>:<CrewMemberManager members={data||[]}/>}
   </section>
  </div></section>
 </main>;
}
