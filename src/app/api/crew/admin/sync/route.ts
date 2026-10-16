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
  let synced=0,missingEmail=0,skipped=0,deactivated=0;
  if(!Array.isArray(crew)||crew.length===0)throw new Error('Rentman returned no crew; refusing to deactivate users');
  const rentmanIds=new Set(crew.map(p=>Number(p.id)));
  const existingAuthEmails=new Set<string>();
  for(let page=1;page<=20;page++){
   const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
   if(error)throw error;
   for(const u of data.users)if(u.email)existingAuthEmails.add(u.email.toLowerCase());
   if(data.users.length<1000)break;
  }
  for(const person of crew){
   const email=String(person.email||'').trim().toLowerCase();
   if(!valid(email)){missingEmail++;continue}
   const name=[person.firstname,person.middle_name,person.lastname].filter(Boolean).join(' ').trim()||person.displayname||'Medewerker';
   const {data:existing,error:lookupError}=await admin.from('crew_portal_members')
    .select('id,login_email_override,manual_disabled,portal_deleted').eq('rentman_crew_id',person.id).maybeSingle();
   if(lookupError)throw lookupError;
   if(existing?.portal_deleted)continue;
   const values={rentman_crew_id:person.id,full_name:name,email,
    rentman_email:email,active:person.active!==false&&!existing?.manual_disabled,last_synced_at:new Date().toISOString()};
   const {error:writeError}=existing
    ?await admin.from('crew_portal_members').update(values).eq('id',existing.id)
    :await admin.from('crew_portal_members').insert(values);
   if(writeError){skipped++;continue}
   const loginEmail=String(existing?.login_email_override||email).toLowerCase();
   if(!existingAuthEmails.has(loginEmail)){
    const {error:authError}=await admin.auth.admin.createUser({email:loginEmail,email_confirm:true});
    if(authError){skipped++;continue}
    existingAuthEmails.add(loginEmail);
   }
   synced++;
  }
  const {data:stored,error:storedError}=await admin.from('crew_portal_members').select('id,rentman_crew_id,active,portal_deleted');
  if(storedError)throw storedError;
  for(const m of stored||[]){if(!rentmanIds.has(Number(m.rentman_crew_id))&&m.active&&!m.portal_deleted){const {error}=await admin.from('crew_portal_members').update({active:false}).eq('id',m.id);if(error)throw error;deactivated++;}}
  return NextResponse.json({synced,missingEmail,skipped,deactivated,total:crew.length});
 }catch{return NextResponse.json({error:'Synchronisatie mislukt. Controleer de Rentman-verbinding en database.'},{status:503})}
}
