import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRentmanCrewIdentities } from '@/lib/rentman';

export const runtime='nodejs';
const valid=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export async function POST(){
 await requireModulePermission('user_admin','manage');
 const admin=createAdminClient();
 try {
  const crew=await getRentmanCrewIdentities();
  let synced=0,missingEmail=0,skipped=0;
  for(const person of crew){
   const email=String(person.email||'').trim().toLowerCase();
   if(!valid(email)){missingEmail++;continue}
   const name=[person.firstname,person.middle_name,person.lastname].filter(Boolean).join(' ').trim()||person.displayname||'Medewerker';
   const {data:existing,error:lookupError}=await admin.from('crew_portal_members')
    .select('id,login_email_override').eq('rentman_crew_id',person.id).maybeSingle();
   if(lookupError)throw lookupError;
   const values={rentman_crew_id:person.id,full_name:name,email,
    rentman_email:email,active:person.active!==false,last_synced_at:new Date().toISOString()};
   const {error:writeError}=existing
    ?await admin.from('crew_portal_members').update(values).eq('id',existing.id)
    :await admin.from('crew_portal_members').insert(values);
   if(writeError){skipped++;continue}
   synced++;
  }
  return NextResponse.json({synced,missingEmail,skipped,total:crew.length});
 }catch{return NextResponse.json({error:'Synchronisatie mislukt. Controleer de Rentman-verbinding en database.'},{status:503})}
}
