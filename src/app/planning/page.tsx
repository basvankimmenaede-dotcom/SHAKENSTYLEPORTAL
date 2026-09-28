import Link from 'next/link';
import { requirePlanningUser } from '@/lib/auth';
import {
  getPlanningProjects,
  getPlanningProjectPeriod,
  type RentmanPlanningProject,
} from '@/lib/rentman';
import {
  findRentmanProjectNumber,
  getPlanningTodoistTasks,
  todoistTaskDate,
  type TodoistTask,
} from '@/lib/todoist';
import ProjectChecklist, {
  type ChecklistTemplate,
  type PlanningChecklist,
} from '@/components/ProjectChecklist';
import TodoistTaskItem from '@/components/TodoistTaskItem';

type ChecklistRow = PlanningChecklist & {
  rentman_project_id: number;
  rentman_project_number: string | null;
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

function shortDate(dateKey?: string | null) {
  if (!dateKey) return null;
  const date = new Date(dateKey.length === 10 ? `${dateKey}T12:00:00+02:00` : dateKey);
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function checklistProgress(checklist?: ChecklistRow) {
  const items = checklist?.project_checklist_items ?? [];
  if (!items.length) return null;
  const required = items.filter((item) => item.is_required);
  const scope = required.length ? required : items;
  const done = scope.filter((item) => item.completed).length;
  return { done, total: scope.length, percent: Math.round((done / scope.length) * 100) };
}

function returnComplete(checklist?: ChecklistRow) {
  return Boolean(
    checklist?.project_checklist_items?.find(
      (item) => item.label.trim().toLowerCase() === 'retour volledig',
    )?.completed,
  );
}

function taskMeta(task: TodoistTask, today: string) {
  const dates = todoistTaskDate(task);
  const date = dates.deadlineDate ?? dates.dueDate;
  if (!date) return { text: null, urgent: false, sort: '9999-99-99' };

  const dateOnly = date.slice(0, 10);
  const overdue = dateOnly < today;
  const isToday = dateOnly === today;
  const prefix = dates.deadlineDate ? 'Deadline' : 'Vervalt';
  return {
    text: overdue
      ? `${prefix} ${shortDate(date)} · te laat`
      : isToday
        ? `${prefix} vandaag`
        : `${prefix} ${shortDate(date)}`,
    urgent: overdue || isToday || task.priority === 1,
    sort: dateOnly,
  };
}

function ProjectCard({
  project,
  checklist,
  tasks,
  templates,
  day,
  today,
}: {
  project: RentmanPlanningProject;
  checklist?: ChecklistRow;
  tasks: TodoistTask[];
  templates: ChecklistTemplate[];
  day: string;
  today: string;
}) {
  const period = getPlanningProjectPeriod(project);
  const progress = checklistProgress(checklist);
  const start = formatTime(period.start);
  const end = formatTime(period.end);
  const spansMultipleDays = period.startDate && period.endDate && period.startDate !== period.endDate;
  const projectNumber = String(project.number ?? project.id);

  return (
    <article className="planningProjectCard">
      <div className="planningProjectTop">
        <div>
          <div className="planningProjectMeta">
            <span className="badge">#{projectNumber}</span>
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

      <ProjectChecklist
        projectId={project.id}
        projectNumber={projectNumber}
        projectName={project.name}
        eventDate={period.startDate}
        checklist={checklist}
        templates={templates}
      />

      <div className="planningTodoistBlock">
        <div className="projectChecklistTitle">
          <strong>Todoist</strong>
          <span>{tasks.length} open</span>
        </div>
        {tasks.length ? (
          <div className="todoistTaskList">
            {tasks.map((task) => {
              const meta = taskMeta(task, today);
              return (
                <TodoistTaskItem
                  key={task.id}
                  id={task.id}
                  content={task.content.replace(new RegExp(`^\\s*${projectNumber}\\s*[-–—:]?\\s*`, 'i'), '') || task.content}
                  meta={meta.text}
                  labels={task.labels}
                  urgent={meta.urgent}
                />
              );
            })}
          </div>
        ) : (
          <div className="planningChecklistEmpty">Geen open Todoist-taken voor dit project.</div>
        )}
      </div>

      <div className="planningCardFooter">
        <span>{day}</span>
        <span>{progress ? `${progress.done}/${progress.total} checklist` : 'Checklist niet gekoppeld'}</span>
      </div>
    </article>
  );
}

export default async function PlanningPage() {
  const { supabase } = await requirePlanningUser();

  let rentmanError: string | null = null;
  let todoistError: string | null = null;

  const [planningResult, todoistResult, checklistResult, templateResult] = await Promise.all([
    getPlanningProjects()
      .then((value) => ({ value, error: null as string | null }))
      .catch((error) => ({
        value: { today: '', tomorrow: '', allProjects: [], todayProjects: [], tomorrowProjects: [] },
        error: error instanceof Error ? error.message : 'Rentman kon niet worden geladen.',
      })),
    getPlanningTodoistTasks()
      .then((value) => ({ value, error: null as string | null }))
      .catch((error) => ({
        value: [] as TodoistTask[],
        error: error instanceof Error ? error.message : 'Todoist kon niet worden geladen.',
      })),
    supabase
      .from('project_checklists')
      .select('id,rentman_project_id,rentman_project_number,status,template_id,project_checklist_items(id,label,completed,is_required,sort_order)'),
    supabase
      .from('checklist_templates')
      .select('id,name')
      .eq('is_active', true)
      .order('name'),
  ]);

  const planning = planningResult.value;
  const todoistTasks = todoistResult.value;
  rentmanError = planningResult.error;
  todoistError = todoistResult.error;

  const checklists = (checklistResult.data ?? []) as ChecklistRow[];
  const templates = (templateResult.data ?? []) as ChecklistTemplate[];
  const checklistByNumber = new Map(
    checklists
      .filter((row) => row.rentman_project_number)
      .map((row) => [String(row.rentman_project_number), row]),
  );
  const checklistById = new Map(checklists.map((row) => [Number(row.rentman_project_id), row]));
  const getChecklist = (project: RentmanPlanningProject) =>
    checklistByNumber.get(String(project.number ?? '')) ?? checklistById.get(project.id);

  const knownProjectNumbers = new Set(
    planning.allProjects
      .map((project) => String(project.number ?? ''))
      .filter(Boolean),
  );
  const visibleProjectNumbers = new Set(
    [...planning.todayProjects, ...planning.tomorrowProjects]
      .map((project) => String(project.number ?? ''))
      .filter(Boolean),
  );

  const tasksByProject = new Map<string, TodoistTask[]>();
  const taskProjectNumber = new Map<string, string | null>();

  for (const task of todoistTasks) {
    const number = findRentmanProjectNumber(task, knownProjectNumbers);
    taskProjectNumber.set(task.id, number);
    if (!number) continue;
    const existing = tasksByProject.get(number) ?? [];
    existing.push(task);
    tasksByProject.set(number, existing);
  }

  const otherTasks = todoistTasks
    .filter((task) => {
      const number = taskProjectNumber.get(task.id);
      return !number || !visibleProjectNumbers.has(number);
    })
    .sort((a, b) => taskMeta(a, planning.today).sort.localeCompare(taskMeta(b, planning.today).sort));

  const thirtyDaysAgo = planning.today
    ? new Date(`${planning.today}T12:00:00+02:00`).getTime() - (30 * 24 * 60 * 60 * 1000)
    : 0;
  const overdueReturnProjects = planning.allProjects
    .filter((project) => {
      const period = getPlanningProjectPeriod(project);
      if (!period.endDate || !planning.today || period.endDate >= planning.today) return false;
      const endTime = new Date(`${period.endDate}T12:00:00+02:00`).getTime();
      if (endTime < thirtyDaysAgo) return false;
      return !returnComplete(getChecklist(project));
    })
    .sort((a, b) => {
      const aEnd = getPlanningProjectPeriod(a).endDate ?? '';
      const bEnd = getPlanningProjectPeriod(b).endDate ?? '';
      return bEnd.localeCompare(aEnd);
    });

  const todayChecklistCount = planning.todayProjects.filter((project) => getChecklist(project)).length;
  const openTodoistCount = todoistTasks.length;

  return (
    <main className="container planningPage">
      <section className="hero planningHero">
        <div>
          <div className="eyebrowLink">Interne planning</div>
          <h1>SHAKENSTYLE Planning</h1>
          <p>Rentman-projecten, Supabase-checklists en Todoist-taken in één operationeel overzicht.</p>
        </div>
        <Link href="/planning/tv" className="button secondary">Open TV-weergave</Link>
      </section>

      {rentmanError ? <div className="notice">Rentman: {rentmanError}</div> : null}
      {todoistError ? <div className="notice">Todoist: {todoistError}</div> : null}

      <section className="planningMetrics">
        <div className="card"><div className="metric">{planning.todayProjects.length}</div><div className="muted">Projecten vandaag</div></div>
        <div className="card"><div className="metric">{planning.tomorrowProjects.length}</div><div className="muted">Projecten morgen</div></div>
        <div className="card"><div className="metric">{openTodoistCount}</div><div className="muted">Open Todoist-taken</div></div>
        <div className="card warningMetric"><div className="metric">{overdueReturnProjects.length}</div><div className="muted">Retour nog open</div></div>
      </section>

      {overdueReturnProjects.length ? (
        <section className="planningAlertSection">
          <div className="planningDayHeader">
            <div>
              <span>Magazijncontrole</span>
              <h2>Projectperiode voorbij, retour nog open</h2>
            </div>
            <strong>{overdueReturnProjects.length} projecten</strong>
          </div>
          <div className="returnAlertGrid">
            {overdueReturnProjects.slice(0, 10).map((project) => {
              const period = getPlanningProjectPeriod(project);
              const checklist = getChecklist(project);
              return (
                <article className="returnAlertCard" key={project.id}>
                  <div>
                    <span className="badge">#{project.number ?? project.id}</span>
                    <strong>{project.name}</strong>
                    <small>Projectperiode eindigde {shortDate(period.endDate)}</small>
                  </div>
                  <span className="returnStatus">{checklist ? 'Retour volledig nog niet afgevinkt' : 'Nog geen checklist gekoppeld'}</span>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="planningDaySection">
        <div className="planningDayHeader">
          <div>
            <span>Vandaag</span>
            <h2>{planning.today ? formatDate(planning.today) : 'Vandaag'}</h2>
          </div>
          <strong>{todayChecklistCount}/{planning.todayProjects.length} met checklist</strong>
        </div>
        {planning.todayProjects.length ? (
          <div className="planningProjectGrid">
            {planning.todayProjects.map((project) => {
              const number = String(project.number ?? '');
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  checklist={getChecklist(project)}
                  tasks={tasksByProject.get(number) ?? []}
                  templates={templates}
                  day="Vandaag"
                  today={planning.today}
                />
              );
            })}
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
            {planning.tomorrowProjects.map((project) => {
              const number = String(project.number ?? '');
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  checklist={getChecklist(project)}
                  tasks={tasksByProject.get(number) ?? []}
                  templates={templates}
                  day="Morgen"
                  today={planning.today}
                />
              );
            })}
          </div>
        ) : (
          <div className="planningEmpty">Geen Rentman-projecten voor morgen.</div>
        )}
      </section>

      <section className="planningDaySection">
        <div className="planningDayHeader">
          <div>
            <span>Todoist</span>
            <h2>Andere taken & deadlines</h2>
          </div>
          <strong>{otherTasks.length} open</strong>
        </div>
        {otherTasks.length ? (
          <div className="standaloneTaskGrid">
            {otherTasks.map((task) => {
              const meta = taskMeta(task, planning.today);
              const projectNumber = taskProjectNumber.get(task.id);
              return (
                <div className="standaloneTaskCard" key={task.id}>
                  {projectNumber ? <span className="badge">#{projectNumber}</span> : <span className="badge green">Losse taak</span>}
                  <TodoistTaskItem
                    id={task.id}
                    content={task.content}
                    meta={meta.text ?? 'Geen deadline'}
                    labels={task.labels}
                    urgent={meta.urgent}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="planningEmpty">Geen overige Todoist-taken.</div>
        )}
      </section>
    </main>
  );
}
