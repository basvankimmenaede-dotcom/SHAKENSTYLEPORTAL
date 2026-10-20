import { requirePlanningUser } from '@/lib/auth';
import { getPlanningCrewAssignmentsForRange } from '@/lib/rentman';
import PersonnelTimeline from '@/components/PersonnelTimeline';

function dateKey(date: Date) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export default async function PersonnelTimelinePage() {
  await requirePlanningUser();
  const today = dateKey(new Date());
  const from = new Date(today+'T12:00:00Z'); from.setUTCDate(from.getUTCDate()-7);
  const until = new Date(today+'T12:00:00Z'); until.setUTCDate(until.getUTCDate()+21);
  let assignments: Awaited<ReturnType<typeof getPlanningCrewAssignmentsForRange>> = [];
  let error = '';
  try { assignments = await getPlanningCrewAssignmentsForRange(dateKey(from),dateKey(until)); }
  catch { error = 'De Rentman-planning kon niet worden geladen. Probeer het later opnieuw.'; }
  const shifts = assignments.flatMap(a => {
    const f=a.function, c=a.crewmember;
    const start=f?.planperiod_start || f?.usageperiod_start, end=f?.planperiod_end || f?.usageperiod_end;
    if(!c?.id || !start || !end) return [];
    return [{id:a.id,personId:c.id,person:c.displayname || [c.firstname,c.middle_name,c.lastname].filter(Boolean).join(' ') || String(c.id),
      role:f?.group?.displayname || f?.group?.name || 'Medewerker',name:f?.displayname || f?.name || 'Dienst',
      start,end,projectId:Number(String(f?.project||'').split('/').pop())||null}];
  });
  return <PersonnelTimeline shifts={shifts} today={today} error={error}/>;
}
