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

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

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

function shortDate(dateKey?: string | null) {
  if (!dateKey) return null;
  const date = new Date(dateKey.length === 10 ? `${dateKey}T12:00:00+02:00` : dateKey);
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function dayLabel(dateKey: string, today: string) {
  if (dateKey === today) return 'Vandaag';
  if (dateKey === addDays(today, 1)) return 'Morgen';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00+02:00`));
}

function dayLongLabel(dateKey: string, today: string) {
  if (dateKey === today) return 'Vandaag';
  if (dateKey === addDays(today, 1)) return 'Morgen';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
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

function returnComplete(checklist?: ChecklistRow) {
  return Boolean(
    checklist?.project_checklist_items?.find(
      (item) => item.label.trim().toLowerCase() === 'retour volledig',
    )?.completed,
  );
}

function projectOverlapsDate(project: RentmanPlanningProject, dateKey: string) {
  const period = getPlanningProjectPeriod(project);
  if (!period.startDate || !period.endDate) return false;
  return period.startDate <= dateKey && period.endDate >= dateKey;
}

function taskDate(task: TodoistTask) {
  const dates = todoistTaskDate(task);
  return (dates.deadlineDate ?? dates.dueDate)?.slice(0, 10) ?? null;
}

function taskMeta(task: TodoistTask, today: string) {
  const dates = todoistTaskDate(task);
  const date = dates.deadlineDate ?? dates.dueDate;
  if (!date) return { text: 'Geen deadline', urgent: false, sort: '9999-99-99' };

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

function CompactProjectRow({
  project,
  checklist,
  templates,
}: {
  project: RentmanPlanningProject;
  checklist?: ChecklistRow;
  templates: ChecklistTemplate[];
}) {
  const period = getPlanningProjectPeriod(project);
  const start = formatTime(period.start);
  const end = formatTime(period.end);
  const number = String(project.number ?? project.id);
  const progress = checklistProgress(checklist);

  return (
    <article className="compactProjectRow">
      <div className="compactProjectTime">
        <strong>{start ?? '—'}</strong>
        {end ? <span>{end}</span> : null}
      </div>

      <div className="compactProjectMain">
        <div className="compactProjectTitle">
          <strong>#{number} · {project.name}</strong>
          {progress ? (
            <span className={progress.done === progress.total ? 'compactProgress complete' : 'compactProgress'}>
              {progress.done}/{progress.total}
            </span>
          ) : (
            <span className="compactProgress empty">geen checklist</span>
          )}
        </div>
        <span>{contactName(project.location)}{project.customer ? ` · ${contactName(project.customer)}` : ''}</span>

        <details className="compactChecklistDetails">
          <summary>{checklist ? 'Checklist openen' : 'Checklist koppelen'}</summary>
          <div className="compactChecklistPanel">
            <ProjectChecklist
              projectId={project.id}
              projectNumber={number}
              projectName={project.name}
              eventDate={period.startDate}
              checklist={checklist}
              templates={templates}
            />
          </div>
        </details>
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
    planning.allProjects.map((project) => String(project.number ?? '')).filter(Boolean),
  );
  const taskProjectNumber = new Map<string, string | null>();
  for (const task of todoistTasks) {
    taskProjectNumber.set(task.id, findRentmanProjectNumber(task, knownProjectNumbers));
  }

  const weekDays = planning.today
    ? Array.from({ length: 7 }, (_, index) => addDays(planning.today, index))
    : [];

  const projectsByDay = new Map<string, RentmanPlanningProject[]>();
  for (const dateKey of weekDays) {
    projectsByDay.set(
      dateKey,
      planning.allProjects
        .filter((project) => projectOverlapsDate(project, dateKey))
        .sort((a, b) => {
          const aStart = getPlanningProjectPeriod(a).start ?? '';
          const bStart = getPlanningProjectPeriod(b).start ?? '';
          return aStart.localeCompare(bStart);
        }),
    );
  }

  const tasksByDay = new Map<string, TodoistTask[]>();
  for (const dateKey of weekDays) {
    tasksByDay.set(
      dateKey,
      todoistTasks
        .filter((task) => taskDate(task) === dateKey)
        .sort((a, b) => taskMeta(a, planning.today).sort.localeCompare(taskMeta(b, planning.today).sort)),
    );
  }

  const overdueTasks = todoistTasks
    .filter((task) => {
      const date = taskDate(task);
      return Boolean(date && planning.today && date < planning.today);
    })
    .sort((a, b) => (taskDate(a) ?? '').localeCompare(taskDate(b) ?? ''));

  const noDateTasks = todoistTasks
    .filter((task) => !taskDate(task))
    .slice(0, 8);

  const laterTasks = todoistTasks
    .filter((task) => {
      const date = taskDate(task);
      return Boolean(date && weekDays.length && date > weekDays[weekDays.length - 1]);
    })
    .sort((a, b) => (taskDate(a) ?? '').localeCompare(taskDate(b) ?? ''))
    .slice(0, 8);

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

  const totalChecklistItems = checklists.reduce(
    (sum, checklist) => sum + (checklist.project_checklist_items?.length ?? 0),
    0,
  );
  const doneChecklistItems = checklists.reduce(
    (sum, checklist) =>
      sum + (checklist.project_checklist_items?.filter((item) => item.completed).length ?? 0),
    0,
  );
  const checklistPercent = totalChecklistItems
    ? Math.round((doneChecklistItems / totalChecklistItems) * 100)
    : 0;

  return (
    <main className="container planningPage planningCompactPage">
      <section className="planningCompactHeader">
        <div>
          <div className="eyebrowLink">Interne planning</div>
          <h1>Planning</h1>
        </div>
        <div className="planningCompactActions">
          <Link href="/planning/templates" className="button secondary">Checklist-templates</Link>
          <Link href="/planning/tv" className="button secondary">TV-weergave</Link>
        </div>
      </section>

      {rentmanError ? <div className="notice">Rentman: {rentmanError}</div> : null}
      {todoistError ? <div className="notice">Todoist: {todoistError}</div> : null}

      <section className="planningWeekStrip">
        {weekDays.map((dateKey, index) => {
          const projects = projectsByDay.get(dateKey) ?? [];
          const tasks = tasksByDay.get(dateKey) ?? [];
          return (
            <a
              key={dateKey}
              href={`#planning-day-${dateKey}`}
              className={index === 0 ? 'planningWeekDay active' : 'planningWeekDay'}
            >
              <div>
                <strong>{dayLabel(dateKey, planning.today)}</strong>
                <span>{shortDate(dateKey)}</span>
              </div>
              <div className="planningWeekCounts">
                <b>{projects.length}</b><small>projecten</small>
                <i />
                <b>{tasks.length}</b><small>taken</small>
              </div>
            </a>
          );
        })}
      </section>

      <section className="planningCompactGrid">
        <div className="planningCompactColumn">
          <div className="planningColumnHeader">
            <div>
              <span>Rentman</span>
              <h2>Projecten agenda</h2>
            </div>
            <strong>7 dagen</strong>
          </div>

          <div className="planningAgendaList">
            {weekDays.map((dateKey) => {
              const projects = projectsByDay.get(dateKey) ?? [];
              return (
                <section className="planningAgendaDay" id={`planning-day-${dateKey}`} key={dateKey}>
                  <div className="planningAgendaDayHeader">
                    <strong>{dayLongLabel(dateKey, planning.today)}</strong>
                    <span>{projects.length} project{projects.length === 1 ? '' : 'en'}</span>
                  </div>
                  {projects.length ? (
                    <div className="compactProjectList">
                      {projects.map((project) => (
                        <CompactProjectRow
                          key={project.id}
                          project={project}
                          checklist={getChecklist(project)}
                          templates={templates}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="compactEmpty">Geen projecten.</div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <div className="planningCompactColumn">
          <div className="planningColumnHeader">
            <div>
              <span>Todoist</span>
              <h2>Taken</h2>
            </div>
            <strong>{todoistTasks.length} open</strong>
          </div>

          <div className="planningAgendaList">
            {overdueTasks.length ? (
              <section className="planningAgendaDay planningOverdueDay">
                <div className="planningAgendaDayHeader">
                  <strong>Te laat</strong>
                  <span>{overdueTasks.length} taken</span>
                </div>
                <div className="compactTaskList">
                  {overdueTasks.map((task) => {
                    const meta = taskMeta(task, planning.today);
                    const projectNumber = taskProjectNumber.get(task.id);
                    return (
                      <TodoistTaskItem
                        key={task.id}
                        id={task.id}
                        content={task.content}
                        meta={projectNumber ? `#${projectNumber} · ${meta.text}` : meta.text}
                        labels={task.labels}
                        urgent
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}

            {weekDays.map((dateKey) => {
              const tasks = tasksByDay.get(dateKey) ?? [];
              return (
                <section className="planningAgendaDay" key={dateKey}>
                  <div className="planningAgendaDayHeader">
                    <strong>{dayLongLabel(dateKey, planning.today)}</strong>
                    <span>{tasks.length} taken</span>
                  </div>
                  {tasks.length ? (
                    <div className="compactTaskList">
                      {tasks.map((task) => {
                        const meta = taskMeta(task, planning.today);
                        const projectNumber = taskProjectNumber.get(task.id);
                        return (
                          <TodoistTaskItem
                            key={task.id}
                            id={task.id}
                            content={task.content}
                            meta={projectNumber ? `#${projectNumber} · ${meta.text}` : meta.text}
                            labels={task.labels}
                            urgent={meta.urgent}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="compactEmpty">Geen taken.</div>
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <aside className="planningOpsColumn">
          <section className="planningOpsCard">
            <div className="planningOpsHeader">
              <span>Operationeel overzicht</span>
            </div>
            <div className="planningOpsMetrics">
              <div className="planningOpsMetric warning">
                <strong>{overdueReturnProjects.length}</strong>
                <span>Retour nog open</span>
              </div>
              <div className="planningOpsMetric">
                <strong>{checklistPercent}%</strong>
                <span>Checklist gereed</span>
              </div>
              <div className="planningOpsMetric">
                <strong>{overdueTasks.length}</strong>
                <span>Taken te laat</span>
              </div>
              <div className="planningOpsMetric">
                <strong>{planning.allProjects.length}</strong>
                <span>Projecten geladen</span>
              </div>
            </div>
          </section>

          <section className="planningOpsCard">
            <div className="planningOpsHeader">
              <span>Te late retouren</span>
              <strong>{overdueReturnProjects.length}</strong>
            </div>
            {overdueReturnProjects.length ? (
              <div className="planningOpsList">
                {overdueReturnProjects.slice(0, 8).map((project) => {
                  const period = getPlanningProjectPeriod(project);
                  return (
                    <div className="planningOpsListItem" key={project.id}>
                      <div>
                        <strong>#{project.number ?? project.id} · {project.name}</strong>
                        <span>Einde project {shortDate(period.endDate)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="compactEmpty">Geen open retouren.</div>
            )}
          </section>

          <section className="planningOpsCard">
            <div className="planningOpsHeader">
              <span>Zonder deadline</span>
              <strong>{noDateTasks.length}</strong>
            </div>
            {noDateTasks.length ? (
              <div className="planningOpsTaskList">
                {noDateTasks.map((task) => (
                  <TodoistTaskItem
                    key={task.id}
                    id={task.id}
                    content={task.content}
                    meta={taskProjectNumber.get(task.id) ? `#${taskProjectNumber.get(task.id)}` : 'Losse taak'}
                    labels={task.labels}
                  />
                ))}
              </div>
            ) : (
              <div className="compactEmpty">Geen taken zonder deadline.</div>
            )}
          </section>

          {laterTasks.length ? (
            <section className="planningOpsCard">
              <div className="planningOpsHeader">
                <span>Later gepland</span>
                <strong>{laterTasks.length}</strong>
              </div>
              <div className="planningOpsTaskList">
                {laterTasks.map((task) => {
                  const meta = taskMeta(task, planning.today);
                  return (
                    <TodoistTaskItem
                      key={task.id}
                      id={task.id}
                      content={task.content}
                      meta={meta.text}
                      labels={task.labels}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
