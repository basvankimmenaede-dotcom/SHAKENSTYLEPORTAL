import {NextResponse} from 'next/server';
import {requireModulePermission} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {getPlanningCrewAssignmentsForRange,getPlanningProjects} from '@/lib/rentman';

export const runtime='nodejs';
export const maxDuration=60;

function dateKey(offset:number){
 const d=new Date(Date.now()+offset*86400000);
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function referenceId(ref:unknown):number|null{
 if(typeof ref==='number' && Number.isSafeInteger(ref))return ref;
 if(typeof ref==='string'){const m=ref.match(/\/(\d+)$/);return m?Number(m[1]):null;}
 if(ref && typeof ref==='object' && 'id' in ref){const id=Number((ref as {id:unknown}).id);return Number.isSafeInteger(id)?id:null;}
 return null;
}
export async function POST(){
 await requireModulePermission('user_admin','manage');
 return synchronizeCrewAssignments();
}

export async function synchronizeCrewAssignments(){
 try{
  const admin=createAdminClient();
  const [rentmanAssignments,planning,membersResult]=await Promise.all([
   getPlanningCrewAssignmentsForRange(dateKey(-7),dateKey(8)),
   getPlanningProjects(),
   admin.from('crew_portal_members').select('id,rentman_crew_id').eq('active',true)
  ]);
  if(membersResult.error)throw membersResult.error;
  const memberIds=new Map((membersResult.data||[]).map(m=>[Number(m.rentman_crew_id),m.id]));
  const projects=new Map(planning.allProjects.map(p=>[p.id,p]));
  let synced=0,skipped=0;
  for(const assignment of rentmanAssignments){
   const crewId=referenceId(assignment.crewmember);
   const memberId=crewId===null?null:memberIds.get(crewId);
   const fn=assignment.function;
   const projectId=referenceId(fn?.project)||referenceId(fn?.group?.project);
   const start=fn?.planperiod_start||fn?.usageperiod_start;
   const end=fn?.planperiod_end||fn?.usageperiod_end;
   if(!memberId||!projectId||!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)){skipped++;continue;}
   const project=projects.get(projectId);
   const location=project?.location;
   const locationName=location?.displayname||location?.name||[location?.visit_street,location?.visit_number,location?.visit_city].filter(Boolean).join(' ')||null;
   const {error}=await admin.from('crew_portal_assignments').upsert({
    rentman_projectcrew_id:assignment.id,crew_member_id:memberId,
    rentman_project_id:projectId,project_name:project?.name||`Rentman project #${projectId}`,
    project_location:locationName,starts_at:start,ends_at:end
   },{onConflict:'rentman_projectcrew_id'});
   if(error){skipped++;continue;}
   synced++;
  }
  return NextResponse.json({synced,skipped,total:rentmanAssignments.length});
 }catch(e){
  console.error('Crew assignment sync failed',e);
  return NextResponse.json({error:'Diensten synchroniseren mislukt. Controleer de serverlogs en Rentman-velden.'},{status:503});
 }
}
