import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {listRentmanCrewMembers} from '@/lib/rentman';
import type {NormalizedRentmanCrew} from '@/lib/crew/rentman-member-data';

/** Idempotent roster sync, never changes portal access or invoice identity settings. */
export async function synchronizeRentmanCrewMembers(){
 const db=createAdminClient();
 const [remote,existingResult]=await Promise.all([
  listRentmanCrewMembers(),
  db.from('crew_portal_members').select('id,rentman_crew_id,full_name,rentman_email,active,portal_deleted').limit(2500)
 ]);
 if(existingResult.error)throw new Error('Crewprofielen konden niet worden opgehaald.');
 const current=new Map((existingResult.data||[]).map(x=>[Number(x.rentman_crew_id),x]));
 const roster=remote.filter((m):m is NormalizedRentmanCrew=>m!==null);
 if(!roster.length)throw new Error('Geen bruikbare crewleden vanuit Rentman.');
 const seen=new Set<number>();
 const stats={total:roster.length,created:0,updated:0,unchanged:0,skipped:0};
 let failed=0;
 for(let start=0;start<roster.length;start+=8){
  const results=await Promise.allSettled(roster.slice(start,start+8).map(async m=>{
   if(seen.has(m.rentman_crew_id)){stats.skipped++;return;}
   seen.add(m.rentman_crew_id);
   const old=current.get(m.rentman_crew_id);
   if(old?.portal_deleted){stats.skipped++;return;}
   const now=new Date().toISOString();
   if(old){
    const changed=old.full_name!==m.full_name||old.rentman_email!==m.rentman_email||old.active!==m.active;
    const {error}=await db.from('crew_portal_members')
     .update({full_name:m.full_name,rentman_email:m.rentman_email,active:m.active,last_synced_at:now})
     .eq('id',old.id).eq('rentman_crew_id',m.rentman_crew_id).eq('portal_deleted',false);
    if(error)throw error;
    if(changed)stats.updated++;else stats.unchanged++;
    return;
   }
   const insert={
    rentman_crew_id:m.rentman_crew_id,full_name:m.full_name,
    email:m.rentman_email,rentman_email:m.rentman_email,active:m.active,
    portal_enabled:false,portal_deleted:false,last_synced_at:now
   };
   const {error}=await db.from('crew_portal_members').insert(insert);
   if(!error){stats.created++;return;}
   if(error.code!=='23505')throw error;
   const {data:race,error:raceError}=await db.from('crew_portal_members')
    .select('id').eq('rentman_crew_id',m.rentman_crew_id).maybeSingle();
   if(raceError)throw raceError;
   if(race){stats.skipped++;return;}
   // A duplicate e-mail must not hide the Rentman profile. Do not invent a login.
   const fallback=await db.from('crew_portal_members').insert({...insert,email:null});
   if(fallback.error){if(fallback.error.code==='23505'){stats.skipped++;return;}throw fallback.error;}
   stats.created++;
  }));
  for(const r of results)if(r.status==='rejected'){
   failed++;console.error('Rentman crew sync error',r.reason instanceof Error?r.reason.message:'unknown');
  }
 }
 if(failed)throw new Error(failed+' crewprofielen konden niet worden gesynchroniseerd.');
 return stats;
}
