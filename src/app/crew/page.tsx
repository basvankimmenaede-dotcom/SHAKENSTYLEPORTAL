import { createClient } from '@/lib/supabase/server';
import CrewLogin from './ui/CrewLogin';
import CrewDashboard from './ui/CrewDashboard';
import {synchronizeCrewAssignments} from '@/lib/crew/synchronize-assignments';
import {getPlanningProjects,getPlanningProjectFunctionsForProject,getPlanningProjectFunctionsForRange,getPlanningCrewAssignmentsForRange} from '@/lib/rentman';

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
 const projectIds=[...new Set((assignments||[]).map(a=>Number(a.rentman_project_id)).filter(Number.isSafeInteger))];
 const projectFunctions=new Map(await Promise.all(projectIds.map(async id=>{
   const functions=await getPlanningProjectFunctionsForProject(id).catch(()=>[]);
   return [id,functions] as const;
 })));
 const customText=(custom:Record<string,unknown>|undefined,id:number)=>{
   const value=custom?.['custom_'+id]??custom?.[String(id)];
   if(value===null||value===undefined||value==='')return null;
   if(typeof value!=='string'&&typeof value!=='number')return null;
   const text=String(value).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
   return text||null;
 };
 // Crew can see open positions, but cannot book themselves into Rentman.
 const localToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [yy,mm,dd]=localToday.split('-').map(Number);
 const endDate=new Date(Date.UTC(yy,mm-1,dd+30)).toISOString().slice(0,10);
 const openShifts=await Promise.all([getPlanningProjectFunctionsForRange(localToday,endDate),getPlanningCrewAssignmentsForRange(localToday,endDate)]).then(([functions,crew])=>{
  const filled=new Map<number,number>();
  for(const item of crew){if(item.function?.id)filled.set(item.function.id,(filled.get(item.function.id)||0)+1);}
  return functions.filter(fn=>fn.type==='crew_function').map(fn=>{
   const needed=Math.max(0,Number(fn.amount||0));
   const available=Math.max(0,needed-(filled.get(fn.id)||0));
   const id=Number(fn.project?.split('/').pop());
   const project=projectMap.get(id);
   return {id:fn.id,projectName:project?.name||'',projectNumber:project?.number==null?'':String(project.number),functionName:fn.displayname||fn.name||'Crew',start:fn.planperiod_start||fn.usageperiod_start||'',end:fn.planperiod_end||fn.usageperiod_end||'',available};
  }).filter(s=>s.available>0&&s.start&&s.end&&s.projectName).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,30);
 }).catch(error=>{console.error('Crew open shifts could not be loaded',error);return [];});
 const linkedAssignments=(assignments||[]).map(a=>{
  const project=projectMap.get(Number(a.rentman_project_id));
  const location=project?.location;
  const contact=project?.cust_contact;
  return {...a,crew_shift_reports:byAssignment.get(a.id)||[],eventInfo:project?{
   number:project.number==null?null:String(project.number),
   customer:project.customer?.displayname||project.customer?.name||null,
   type:project.project_type?.displayname||project.project_type?.name||null,
   address:[location?.visit_street,location?.visit_number].filter(Boolean).join(' ')||null,
   postalCity:[location?.visit_postalcode,location?.visit_city].filter(Boolean).join(' ')||null,
   contactName:contact?.displayname||[contact?.firstname,contact?.middle_name,contact?.lastname].filter(Boolean).join(' ')||null,
   locationContactName:project.loc_contact?.displayname||[project.loc_contact?.firstname,project.loc_contact?.middle_name,project.loc_contact?.lastname].filter(Boolean).join(' ')||null,
   locationContactPhone:project.loc_contact?.mobilephone||project.loc_contact?.phone||null,
   eventDescription:customText(project?.custom,30),
   cocktailCount:customText(project?.custom,40),
   cocktails:customText(project?.custom,34),
   bar:customText(project?.custom,38),
   brand:customText(project?.custom,79)
  }:null,
  daySchedule:(projectFunctions.get(Number(a.rentman_project_id))||[]).filter(fn=>{
   const start=fn.planperiod_start||fn.usageperiod_start;
   return Boolean(start&&start.slice(0,10)===a.starts_at.slice(0,10)&&fn.type!=='remark');
  }).map(fn=>({label:fn.displayname||fn.name||'Gepland onderdeel',start:fn.planperiod_start||fn.usageperiod_start||'',end:fn.planperiod_end||fn.usageperiod_end||''})).filter(fn=>fn.start&&fn.end).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,30)};
 });
 return <CrewDashboard memberName={member.full_name} assignments={linkedAssignments} openShifts={openShifts} reportsLoadError={Boolean(reportsError||assignmentsError)} />;
}
