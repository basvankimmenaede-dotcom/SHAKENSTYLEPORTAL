import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import CrewProfilesManager from '@/components/CrewProfilesManager';

export const dynamic='force-dynamic';
export default async function CrewProfilesPage(){
 await requireAdmin();
 const {data,error}=await createAdminClient().from('crew_portal_members')
  .select('id,rentman_crew_id,full_name,email,rentman_email,login_email_override,company_name,company_alias,invoice_email,active,portal_enabled,portal_deleted,manual_disabled,last_synced_at')
  .order('full_name',{ascending:true});
 return <main className="container usersAdminPage">
  <section className="usersAdminHeader">
   <div><span className="usersAdminEyebrow">Personeel / Rentman</span><h1>Crewprofielen</h1>
    <p>Beheer de eigen portaaltoegang, bedrijfsnamen en factuuradressen. Rentman bepaalt alleen de planninggegevens.</p></div>
   <Link href="/admin/personeel/inloggen" className="button secondary">Crew-loginstatus</Link>
  </section>
  {error?<div className="error">Crewprofielen konden niet worden geladen.</div>:<CrewProfilesManager members={(data||[]).map(m=>({
   id:m.id,rentman_crew_id:Number(m.rentman_crew_id),full_name:m.full_name,
   email:m.email||null,rentman_email:m.rentman_email||null,login_email_override:m.login_email_override||null,
   company_name:m.company_name||null,company_alias:m.company_alias||null,invoice_email:m.invoice_email||null,
   active:Boolean(m.active),portal_enabled:Boolean(m.portal_enabled),portal_deleted:Boolean(m.portal_deleted),
   manual_disabled:Boolean(m.manual_disabled),last_synced_at:m.last_synced_at||null
  }))}/>}
 </main>;
}
