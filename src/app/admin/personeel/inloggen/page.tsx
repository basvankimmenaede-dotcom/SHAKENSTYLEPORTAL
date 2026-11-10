import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import CrewAccessStatus from '@/components/CrewAccessStatus';
export const dynamic='force-dynamic';
export default async function CrewLoginStatusPage(){
 await requireAdmin();
 const admin=createAdminClient();
 const [profiles,first]=await Promise.all([
  admin.from('crew_portal_members').select('id,full_name,email,rentman_email,login_email_override,rentman_crew_id,active,manual_disabled,portal_deleted,last_synced_at').order('full_name'),
  admin.auth.admin.listUsers({page:1,perPage:200})
 ]);
 const authUsers=[...(first.data?.users||[])];
 let page=2;
 while(authUsers.length&&authUsers.length%200===0&&page<=20){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
  if(error||!data?.users?.length)break;
  authUsers.push(...data.users);
  if(data.users.length<200)break;
  page++;
 }
 const byEmail=new Map(authUsers.filter(a=>a.email).map(a=>[a.email!.trim().toLowerCase(),a]));
 const members=(profiles.data||[]).filter(m=>!m.portal_deleted).map(m=>{
  const email=String(m.login_email_override||m.email||m.rentman_email||'').trim().toLowerCase();
  const login=email?byEmail.get(email):undefined;
  return {id:m.id,name:m.full_name,email,rentmanActive:Boolean(m.active),
   manualDisabled:Boolean(m.manual_disabled),portalDeleted:Boolean(m.portal_deleted),lastSyncedAt:m.last_synced_at,
   accountState:!login?'missing' as const:login.last_sign_in_at?'active' as const:login.confirmed_at?'confirmed' as const:'invited' as const};
 });
 return <main className="container accessAreasPage">
  <section className="usersAdminHeader"><div><span className="usersAdminEyebrow">Personeel / Toegang</span>
   <h1>Crew-loginstatus</h1><p>Bekijk per bartender afzonderlijk Rentman-actief, portaalblokkade en accountactivatie.</p></div>
   <Link className="button secondary" href="/admin/personeel">Terug naar personeel</Link>
  </section>
  {profiles.error?<div className="error">Crewgegevens konden niet worden geladen.</div>:<CrewAccessStatus members={members}/>}
 </main>;
}
