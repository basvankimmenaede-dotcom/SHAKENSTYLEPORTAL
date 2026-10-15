import { createClient } from '@/lib/supabase/server';
import CrewLogin from './ui/CrewLogin';
import CrewDashboard from './ui/CrewDashboard';
import {synchronizeCrewAssignments} from '@/lib/crew/synchronize-assignments';
import {getPlanningProjects} from '@/lib/rentman';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user?.email) return <CrewLogin />;
 const { data: member } = await supabase.from('crew_portal_members').select('id,full_name,email,rentman_crew_id').eq('active', true).maybeSingle();
 if (!member || !Number.isSafeInteger(Number(member.rentman_crew_id)) || Number(member.rentman_crew_id) <= 0 || member.email?.trim().toLowerCase() !== user.email.trim().toLowerCase()) return <CrewLogin signedInButNotLinked />;
 // Refresh Rentman assignments on every authenticated Crew page opening.
 // A failed refresh must not hide previously synchronized assignments.
 const syncResult=await synchronizeCrewAssignments();
 if(!syncResult.ok)console.error('Crew planning refresh failed on page open');
 const from = new Date(Date.now()-7*86400000).toISOString();
 const to = new Date(Date.now()+120*86400000).toISOString();
 const { data: assignments, error: assignmentsError } = await supabase.from('crew_portal_assignments')
 .select('id,rentman_project_id,project_name,project_location,starts_at,ends_at')
 .eq('crew_member_id', member.id).gte('starts_at',from).lte('starts_at',to).order('starts_at');
 const { data: reports, error: reportsError } = await supabase.from('crew_shift_reports')
 .select('id,assignment_id,status,submitted_at,work_started_at,work_ended_at,break_minutes,travel_minutes,expenses_amount,expenses_description,breakage_over_ten,missing_materials,missing_materials_description,notes')
 .eq('crew_member_id',member.id);
 if(assignmentsError)console.error('Crew assignments load failed',assignmentsError);
 if(reportsError)console.error('Crew reports load failed',reportsError);
 const byAssignment = new Map<string, NonNullable<typeof reports>>();
 for(const report of reports || []){
  const list=byAssignment.get(report.assignment_id)||[];
  list.push(report);
  byAssignment.set(report.assignment_id,list);
 }
 const rentmanProjects=await getPlanningProjects().catch(()=>null);
 const projectMap=new Map((rentmanProjects?.allProjects||[]).map(p=>[p.id,p]));
 const linkedAssignments=(assignments||[]).map(a=>{
  const project=projectMap.get(Number(a.rentman_project_id));
  const location=project?.location;
  const contact=project?.loc_contact;
  return {...a,crew_shift_reports:byAssignment.get(a.id)||[],eventInfo:project?{
   number:project.number==null?null:String(project.number),
   customer:project.customer?.displayname||project.customer?.name||null,
   type:project.project_type?.displayname||project.project_type?.name||null,
   address:[location?.visit_street,location?.visit_number].filter(Boolean).join(' ')||null,
   postalCity:[location?.visit_postalcode,location?.visit_city].filter(Boolean).join(' ')||null,
   contactName:contact?.displayname||[contact?.firstname,contact?.middle_name,contact?.lastname].filter(Boolean).join(' ')||null,
   contactPhone:contact?.mobilephone||contact?.phone||null
  }:null};
 });
 return <CrewDashboard memberName={member.full_name} assignments={linkedAssignments} reportsLoadError={Boolean(reportsError||assignmentsError)} />;
}
