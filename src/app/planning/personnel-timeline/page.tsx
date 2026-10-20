import { requirePlanningUser } from '@/lib/auth';
import { getPlanningCrewAssignmentsForRange, getPlanningProjects, getPlanningSubprojects } from '@/lib/rentman';
import PersonnelTimeline from '@/components/PersonnelTimeline';

function dateKey(date: Date) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export default async function PersonnelTimelinePage() {
  await requirePlanningUser();
  const today = dateKey(new Date());
  const from = new Date(today+'T12:00:00Z'); from.setUTCDate(from.getUTCDate()-7);
  const until = new Date(today+'T12:00:00Z'); until.setUTCDate(until.getUTCDate()+21);
  let assignments: Awaited<ReturnType<typeof getPlanningCrewAssignmentsForRange>> = [];
  let error = '';
  let projects: Awaited<ReturnType<typeof getPlanningProjects>>['allProjects'] = [];
  let subprojects: Awaited<ReturnType<typeof getPlanningSubprojects>> = [];
  try { assignments = await getPlanningCrewAssignmentsForRange(dateKey(from),dateKey(until)); }
  catch { error = 'De Rentman-planning kon niet worden geladen. Probeer het later opnieuw.'; }
  try { [projects,subprojects] = await Promise.all([(async()=> (await getPlanningProjects()).allProjects)(),getPlanningSubprojects()]); }
  catch { /* Show shifts even when project metadata is unavailable. */ }
  const projectMap = new Map(projects.map(p => [p.id,p]));
  const subprojectMap = new Map(subprojects.map(s => [s.id,s]));
  const shifts = assignments.flatMap(a => {
    const f=a.function, c=a.crewmember;
    const start=f?.planperiod_start || f?.usageperiod_start, end=f?.planperiod_end || f?.usageperiod_end;
    if(!c?.id || !start || !end) return [];
    const projectId=Number(String(f?.project||'').split('/').pop())||null;
    const project=projectId?projectMap.get(projectId):undefined;
    const subprojectId=Number(String(f?.subproject||'').split('/').pop())||null;
    const subproject=subprojectId?subprojectMap.get(subprojectId):undefined;
    const location=subproject?.location||project?.location;
    const transport=(a.transport||'').toLowerCase().trim().replaceAll(' ','_');
    const outbound=transport==='round_trip'||transport==='only_way_there'||transport==='only_there'||transport==='outbound_only';
    const returnTrip=transport==='round_trip'||transport==='only_way_back'||transport==='only_back'||transport==='return_only';
    const address=location?[location.visit_street,location.visit_number,location.visit_postalcode,location.visit_city].filter(Boolean).join(' '):'';
    return [{id:a.id,personId:c.id,person:c.displayname || [c.firstname,c.middle_name,c.lastname].filter(Boolean).join(' ') || String(c.id),
      role:f?.group?.displayname || f?.group?.name || 'Medewerker',name:f?.displayname || f?.name || 'Dienst',
      start,end,travelBeforeMinutes:outbound&&typeof f?.travel_time_before==='number'?f.travel_time_before:null,travelAfterMinutes:returnTrip&&typeof f?.travel_time_after==='number'?f.travel_time_after:null,transport:transport||null,outbound,returnTrip,subprojectName:subproject?.name||null,projectId,projectName:project?.name||null,projectNumber:project?.number?String(project.number):null,customer:project?.customer?.displayname||project?.customer?.name||null,location:location?.displayname||location?.name||null,address:address||null}];
  });
  return <PersonnelTimeline shifts={shifts} today={today} error={error}/>;
}
