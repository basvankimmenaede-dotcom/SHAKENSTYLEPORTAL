import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import CrewMemberManager from './ui/CrewMemberManager';
export const dynamic='force-dynamic';
export default async function CrewAdminPage(){
 await requireModulePermission('user_admin','manage');
 const {data,error}=await createAdminClient().from('crew_portal_members')
 .select('id,rentman_crew_id,full_name,email,rentman_email,login_email_override,active,last_synced_at')
 .order('full_name');
 return <main className="container"><div className="hero"><div><h1>Crew · Medewerkers</h1><p>Rentman blijft de bron. Afwijkende inlogadressen blijven behouden bij synchronisatie.</p></div></div>
 {error?<div className="error">Crew-tabellen zijn nog niet ingericht.</div>:<CrewMemberManager members={data||[]}/>}</main>;
}
