import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanningProjects, getPlanningProjectPeriod, type RentmanPlanningProject } from '@/lib/rentman';

type ChecklistRow = {
  id: number;
  rentman_project_id: number;
  status: string;
  project_checklist_items?: Array<{ completed: boolean; is_required: boolean }> | null;
};

function contactName(value?: { displayname?: string; name?: string } | null) {
  return value?.displayname || value?.name || '—';
}

function formatTime(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateKey}T12:00:00+02:00`));
}

function checklistProgress(checklist?: ChecklistRow) {
  const items = checklist?.project_checklist_items ?? [];
  if (!items.length) return null;
  const required = items.filter((item) => item.is_required);
  const scope = required.length ? required : items;
  const done = scope.filter((item) => item.completed).length;
  return { done, total: scope.length, percent: Math.round((done / scope.length) * 100) };
}

function ProjectCard({
  project,
  checklist,
  day,
}: {
  project: RentmanPlanningProject;
  checklist?: ChecklistRow;
  day: string;
}) {
  const period = getPlanningProjectPeriod(project);
  const progress = checklistProgress(checklist);
  const start = formatTime(period.start);
  const end = formatTime(period.end);
  const spansMultipleDays = period.startDate && period.endDate && period.startDate !== period.endDate;

  return (
    <article className="planningProjectCard">
      <div className="planningProjectTop">
        <div>
          <div className="planningProjectMeta">
            <span className="badge">#{project.number ?? project.id}</span>
            {project.project_type?.displayname || project.project_type?.name ? (
              <span className="planningType">{project.project_type?.displayname || project.project_type?.name}</span>
            ) : null}
          </div>
          <h3>{project.name}</h3>
        </div>
        <div className="planningTime">
          {start ? <strong>{start}</strong> : <strong>Hele dag</strong>}
          {end && !spansMultipleDays ? <span>– {end}</span> : null}
        </div>
      </div>

      <div className="planningDetails">
        <div><span>Klant</span><strong>{contactName(project.customer)}</strong></div>
        <div><span>Locatie</span><strong>{contactName(project.location)}</strong></div>
        {spansMultipleDays ? (
          <div><span>Periode</span><strong>{period.startDate} → {period.endDate}</strong></div>
        ) : null}
      </div>

      <div className="planningChecklist">
        {progress ? (
          <>
            <div className="planningChecklistLabel">
              <span>Checklist</span>
              <strong>{progress.done}/{progress.total} klaar</strong>
            </div>
            <div className="planningProgress"><span style={{ width: `${progress.percent}%` }} /></div>
          </>
        ) : (
          <div className="planningChecklistEmpty">
            Nog geen checklist gekoppeld
          </div>
        )}
      </div>

      <div className="planningCardFooter">
        <span>{day}</span>
        {checklist?.status === 'completed' ? <span className="planningDone">Compleet</span> : null}
      </div>
    </article>
  );
}

export default async function PlanningPage() {
  const admin = createAdminClient();

  let planning;
  let rentmanError: string | null = null;
  try {
    planning = await getPlanningProjects();
  } catch (error) {
    rentmanError = error instanceof Error ? error.message : 'Rentman kon niet worden geladen.';
    planning = { today: '', tomorrow: '', todayProjects: [], tomorrowProjects: [] };
  }

  const projectIds = [...planning.todayProjects, ...planning.tomorrowProjects].map((project) => project.id);
  let checklistMap = new Map<number, ChecklistRow>();

  if (projectIds.length) {
    const { data } = await admin
      .from('project_checklists')
      .select('id,rentman_project_id,status,project_checklist_items(completed,is_required)')
      .in('rentman_project_id', projectIds);

    checklistMap = new Map(
      ((data ?? []) as ChecklistRow[]).map((row) => [Number(row.rentman_project_id), row]),
    );
  }

  const totalProjects = planning.todayProjects.length + planning.tomorrowProjects.length;
  const linkedChecklists = [...checklistMap.values()].length;
  const incomplete = [...checklistMap.values()].filter((row) => {
    const progress = checklistProgress(row);
    return progress && progress.done < progress.total;
  }).length;

  return (
    <main className="container planningPage">
      <section className="hero planningHero">
        <div>
          <div className="eyebrowLink">Interne planning</div>
          <h1>SHAKENSTYLE Planning</h1>
          <p>Live overzicht van Rentman-projecten en de operationele projectchecklists.</p>
        </div>
        <Link href="/planning/tv" className="button secondary">Open TV-weergave</Link>
      </section>

      {rentmanError ? <div className="notice">Rentman: {rentmanError}</div> : null}

      <section className="planningMetrics">
        <div className="card"><div className="metric">{planning.todayProjects.length}</div><div className="muted">Vandaag</div></div>
        <div className="card"><div className="metric">{planning.tomorrowProjects.length}</div><div className="muted">Morgen</div></div>
        <div className="card"><div className="metric">{linkedChecklists}/{totalProjects}</div><div className="muted">Checklist gekoppeld</div></div>
        <div className="card"><div className="metric">{incomplete}</div><div className="muted">Checklist nog open</div></div>
      </section>

      <section className="planningDaySection">
        <div className="planningDayHeader">
          <div>
            <span>Vandaag</span>
            <h2>{planning.today ? formatDate(planning.today) : 'Vandaag'}</h2>
          </div>
          <strong>{planning.todayProjects.length} projecten</strong>
        </div>
        {planning.todayProjects.length ? (
          <div className="planningProjectGrid">
            {planning.todayProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                checklist={checklistMap.get(project.id)}
                day="Vandaag"
              />
            ))}
          </div>
        ) : (
          <div className="planningEmpty">Geen Rentman-projecten voor vandaag.</div>
        )}
      </section>

      <section className="planningDaySection">
        <div className="planningDayHeader">
          <div>
            <span>Morgen</span>
            <h2>{planning.tomorrow ? formatDate(planning.tomorrow) : 'Morgen'}</h2>
          </div>
          <strong>{planning.tomorrowProjects.length} projecten</strong>
        </div>
        {planning.tomorrowProjects.length ? (
          <div className="planningProjectGrid">
            {planning.tomorrowProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                checklist={checklistMap.get(project.id)}
                day="Morgen"
              />
            ))}
          </div>
        ) : (
          <div className="planningEmpty">Geen Rentman-projecten voor morgen.</div>
        )}
      </section>
    </main>
  );
}
