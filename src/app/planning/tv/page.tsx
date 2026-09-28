import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanningProjects, getPlanningProjectPeriod, type RentmanPlanningProject } from '@/lib/rentman';

type ChecklistRow = {
  rentman_project_id: number;
  project_checklist_items?: Array<{ completed: boolean; is_required: boolean }> | null;
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function progress(row?: ChecklistRow) {
  const items = row?.project_checklist_items ?? [];
  const required = items.filter((item) => item.is_required);
  const scope = required.length ? required : items;
  if (!scope.length) return null;
  const done = scope.filter((item) => item.completed).length;
  return { done, total: scope.length };
}

function TvProject({ project, checklist }: { project: RentmanPlanningProject; checklist?: ChecklistRow }) {
  const period = getPlanningProjectPeriod(project);
  const check = progress(checklist);

  return (
    <div className="tvProject">
      <div className="tvProjectTime">{formatTime(period.start)}</div>
      <div className="tvProjectMain">
        <strong>{project.name}</strong>
        <span>#{project.number ?? project.id} · {project.location?.displayname || project.location?.name || 'Locatie niet ingevuld'}</span>
      </div>
      <div className={check && check.done === check.total ? 'tvCheck complete' : 'tvCheck'}>
        {check ? `${check.done}/${check.total}` : '—'}
      </div>
    </div>
  );
}

export default async function PlanningTvPage() {
  const admin = createAdminClient();
  const planning = await getPlanningProjects();
  const projects = [...planning.todayProjects, ...planning.tomorrowProjects];
  const ids = projects.map((project) => project.id);

  let checklistMap = new Map<number, ChecklistRow>();
  if (ids.length) {
    const { data } = await admin
      .from('project_checklists')
      .select('rentman_project_id,project_checklist_items(completed,is_required)')
      .in('rentman_project_id', ids);
    checklistMap = new Map(((data ?? []) as ChecklistRow[]).map((row) => [Number(row.rentman_project_id), row]));
  }

  return (
    <main className="planningTv">
      <header className="planningTvHeader">
        <div>
          <span>SHAKENSTYLE</span>
          <h1>Dagplanning</h1>
        </div>
        <div className="planningTvClock">Live uit Rentman</div>
      </header>

      <div className="planningTvColumns">
        <section>
          <div className="planningTvDayTitle"><span>Vandaag</span><strong>{planning.todayProjects.length}</strong></div>
          <div className="planningTvList">
            {planning.todayProjects.length ? planning.todayProjects.map((project) => (
              <TvProject key={project.id} project={project} checklist={checklistMap.get(project.id)} />
            )) : <div className="tvEmpty">Geen projecten</div>}
          </div>
        </section>

        <section>
          <div className="planningTvDayTitle"><span>Morgen</span><strong>{planning.tomorrowProjects.length}</strong></div>
          <div className="planningTvList">
            {planning.tomorrowProjects.length ? planning.tomorrowProjects.map((project) => (
              <TvProject key={project.id} project={project} checklist={checklistMap.get(project.id)} />
            )) : <div className="tvEmpty">Geen projecten</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
