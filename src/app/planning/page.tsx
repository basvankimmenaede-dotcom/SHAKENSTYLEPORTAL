import Link from 'next/link';
import { requirePlanningUser } from '@/lib/auth';
import {
  getPlanningProjects,
  getPlanningProjectPeriod,
  getPlanningCrewAssignments,
  getPlanningProjectFunctionGroups,
  getPlanningProjectFunctions,
  getPlanningProjectVehicles,
  getOverdueReturnProjects as getRentmanOverdueReturnProjects,
  type RentmanPlanningProject,
  type RentmanPlanningCrewAssignment,
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
import PlanningAutoRefresh from '@/components/PlanningAutoRefresh';
import CrewPlanningPopup from '@/components/CrewPlanningPopup';
import PlanningTaskCreateButton from '@/components/PlanningTaskCreateButton';

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

function projectOverlapsDate(project: RentmanPlanningProject, dateKey: string) {
  const period = getPlanningProjectPeriod(project);
  if (!period.startDate || !period.endDate) return false;
  return period.startDate <= dateKey && period.endDate >= dateKey;
}

function isLongTermRental(project: RentmanPlanningProject) {
  const typeName = project.project_type?.displayname ?? project.project_type?.name ?? '';
  return typeName.trim().toLowerCase() === 'langdurige verhuur';
}

function taskDate(task: TodoistTask) {
  const dates = todoistTaskDate(task);
  return (dates.deadlineDate ?? dates.dueDate)?.slice(0, 10) ?? null;
}

function displayTaskContent(task: TodoistTask, projectNumber?: string | null) {
  if (!projectNumber) return task.content;
  return task.content.replace(
    new RegExp(`^\\s*${projectNumber}\\s*[-–—:]?\\s*`, 'i'),
    '',
  ) || task.content;
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
  const preferredTemplateId = project.project_type?.id
    ? templates.find((template) => template.rentman_project_type_id === project.project_type?.id)?.id ?? null
    : null;

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
              preferredTemplateId={preferredTemplateId}
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

  const [planningResult, todoistResult, crewResult, functionGroupsResult, projectFunctionsResult, projectVehiclesResult, checklistResult, templateResult] = await Promise.all([
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
    getPlanningCrewAssignments()
      .then((value) => ({ value, error: null as string | null }))
      .catch((error) => ({
        value: [] as RentmanPlanningCrewAssignment[],
        error: error instanceof Error ? error.message : 'Personeelsplanning kon niet worden geladen.',
      })),
    getPlanningProjectFunctionGroups()
      .then((value) => ({ value, error: null as string | null }))
      .catch(() => ({ value: [], error: null as string | null })),
    getPlanningProjectFunctions()
      .then((value) => ({ value, error: null as string | null }))
      .catch(() => ({ value: [], error: null as string | null })),
    getPlanningProjectVehicles()
      .then((value) => ({ value, error: null as string | null }))
      .catch(() => ({ value: [], error: null as string | null })),
    supabase
      .from('project_checklists')
      .select('id,rentman_project_id,rentman_project_number,status,template_id,project_checklist_items(id,label,completed,is_required,sort_order,deadline_offset_days,due_date,todoist_task_id)'),
    supabase
      .from('checklist_templates')
      .select('id,name,rentman_project_type_id')
      .eq('is_active', true)
      .order('name'),
  ]);

  const planning = planningResult.value;
  const todoistTasks = todoistResult.value;
  const crewAssignments = crewResult.value;
  const projectFunctionGroups = functionGroupsResult.value;
  const projectFunctions = projectFunctionsResult.value;
  const projectVehicles = projectVehiclesResult.value;
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

  const projectById = new Map(planning.allProjects.map((project) => [project.id, project]));
  const projectByNumber = new Map(
    planning.allProjects
      .filter((project) => project.number)
      .map((project) => [String(project.number), project]),
  );

  const functionGroupsByProjectId = new Map<number, typeof projectFunctionGroups>();
  for (const group of projectFunctionGroups) {
    const projectId = Number(group.project?.split('/').pop());
    if (!Number.isFinite(projectId)) continue;
    const current = functionGroupsByProjectId.get(projectId) ?? [];
    current.push(group);
    functionGroupsByProjectId.set(projectId, current);
  }

  const functionsByProjectId = new Map<number, typeof projectFunctions>();
  for (const fn of projectFunctions) {
    const projectId = Number(fn.project?.split('/').pop());
    if (!Number.isFinite(projectId)) continue;
    const current = functionsByProjectId.get(projectId) ?? [];
    current.push(fn);
    functionsByProjectId.set(projectId, current);
  }

  const vehiclesByProjectId = new Map<number, typeof projectVehicles>();
  for (const item of projectVehicles) {
    const projectId = Number(item.function?.project?.split('/').pop());
    if (!Number.isFinite(projectId)) continue;
    const current = vehiclesByProjectId.get(projectId) ?? [];
    current.push(item);
    vehiclesByProjectId.set(projectId, current);
  }

  const crewByDay = new Map<string, RentmanPlanningCrewAssignment[]>();
  for (const dateKey of weekDays) {
    crewByDay.set(
      dateKey,
      crewAssignments
        .filter((assignment) => {
          const fn = assignment.function;
          const start = fn?.planperiod_start ?? fn?.usageperiod_start ?? null;
          const end = fn?.planperiod_end ?? fn?.usageperiod_end ?? start;
          if (!start || !end) return false;
          return start.slice(0, 10) <= dateKey && end.slice(0, 10) >= dateKey;
        })
        .sort((a, b) => {
          const aStart = a.function?.planperiod_start ?? a.function?.usageperiod_start ?? '';
          const bStart = b.function?.planperiod_start ?? b.function?.usageperiod_start ?? '';
          return aStart.localeCompare(bStart);
        }),
    );
  }

  const longTermProjects = planning.allProjects
    .filter((project) =>
      isLongTermRental(project)
      && weekDays.some((dateKey) => projectOverlapsDate(project, dateKey))
    )
    .sort((a, b) => {
      const aStart = getPlanningProjectPeriod(a).startDate ?? '';
      const bStart = getPlanningProjectPeriod(b).startDate ?? '';
      return aStart.localeCompare(bStart);
    });

  const projectsByDay = new Map<string, RentmanPlanningProject[]>();
  for (const dateKey of weekDays) {
    projectsByDay.set(
      dateKey,
      planning.allProjects
        .filter((project) => !isLongTermRental(project) && projectOverlapsDate(project, dateKey))
        .sort((a, b) => {
          const aStart = a.usageperiod_start ?? a.planperiod_start ?? '';
          const bStart = b.usageperiod_start ?? b.planperiod_start ?? '';
          return bStart.localeCompare(aStart);
        }),
    );
  }

  function effectiveTaskDate(task: TodoistTask) {
    return taskDate(task);
  }

  const tasksByDay = new Map<string, TodoistTask[]>();
  for (const dateKey of weekDays) {
    tasksByDay.set(
      dateKey,
      todoistTasks
        .filter((task) => effectiveTaskDate(task) === dateKey)
        .sort((a, b) => taskMeta(a, planning.today).sort.localeCompare(taskMeta(b, planning.today).sort)),
    );
  }

  const overdueTasks = todoistTasks
    .filter((task) => {
      const date = taskDate(task);
      return Boolean(date && planning.today && date < planning.today);
    })
    .sort((a, b) => (taskDate(a) ?? '').localeCompare(taskDate(b) ?? ''));

  const todayActionTasks = todoistTasks
    .filter((task) => {
      const date = effectiveTaskDate(task);
      return Boolean(date && planning.today && date <= planning.today);
    })
    .sort((a, b) => {
      const aDate = effectiveTaskDate(a) ?? '';
      const bDate = effectiveTaskDate(b) ?? '';
      return aDate.localeCompare(bDate);
    });

  const todayActionCount = todayActionTasks.length;


  const noDateTasks = todoistTasks
    .filter((task) => !taskDate(task))
    .slice(0, 40);

  const laterTasks = todoistTasks
    .filter((task) => {
      const date = taskDate(task);
      return Boolean(date && weekDays.length && date > weekDays[weekDays.length - 1]);
    })
    .sort((a, b) => (taskDate(a) ?? '').localeCompare(taskDate(b) ?? ''))
    .slice(0, 8);

  const rentmanReturnResult = planning.today
    ? getRentmanOverdueReturnProjects(planning.allProjects, planning.today)
    : { configured: false, projects: [] as RentmanPlanningProject[] };
  const overdueReturnProjects = rentmanReturnResult.projects;

  const weeklyCrewCount = weekDays.reduce(
    (sum, dateKey) => sum + (crewByDay.get(dateKey)?.length ?? 0),
    0,
  );

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
    <>
      <PlanningAutoRefresh intervalMs={60000} />
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
          const crew = crewByDay.get(dateKey) ?? [];
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
                <span className="planningWeekStat"><b>{projects.length}</b><small>projecten</small></span>
                <span className="planningWeekStat"><b>{tasks.length}</b><small>taken</small></span>
                <span className="planningWeekStat"><b>{crew.length}</b><small>crew</small></span>
              </div>
            </a>
          );
        })}
      </section>

      {todayActionCount ? (
        <a
          href={todayActionTasks.length ? '#todo-today' : `#planning-day-${planning.today}`}
          className="planningActionBanner"
        >
          <div className="planningActionIcon">!</div>
          <div className="planningActionCopy">
            <span>Actie voor vandaag</span>
            <strong>{todayActionCount} {todayActionCount === 1 ? 'actie vraagt' : 'acties vragen'} vandaag aandacht</strong>
            <small>
              {todayActionTasks
                .map((task) => displayTaskContent(task, taskProjectNumber.get(task.id)))
                .slice(0, 3)
                .join(' · ')}
              {todayActionCount > 3 ? ` · +${todayActionCount - 3} meer` : ''}
            </small>
          </div>
          <div className="planningActionCta">Bekijk acties →</div>
        </a>
      ) : null}

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

          {longTermProjects.length ? (
            <section className="planningLongTermSection">
              <div className="planningLongTermHeader">
                <div>
                  <span>Rentman</span>
                  <h3>Langdurige verhuur</h3>
                </div>
                <strong>{longTermProjects.length}</strong>
              </div>
              <div className="planningLongTermList">
                {longTermProjects.map((project) => {
                  const period = getPlanningProjectPeriod(project);
                  return (
                    <article className="planningLongTermRow" key={project.id}>
                      <div className="planningLongTermDates">
                        <strong>{shortDate(period.startDate) ?? '—'}</strong>
                        <span>t/m {shortDate(period.endDate) ?? '—'}</span>
                      </div>
                      <div className="planningLongTermMain">
                        <strong>#{project.number ?? project.id} · {project.name}</strong>
                        <span>{contactName(project.location)}{project.customer ? ` · ${contactName(project.customer)}` : ''}</span>
                      </div>
                      <div className="planningLongTermChecklist">
                        {checklistProgress(getChecklist(project)) ? (
                          <span className="compactProgress">
                            {checklistProgress(getChecklist(project))!.done}/{checklistProgress(getChecklist(project))!.total}
                          </span>
                        ) : (
                          <span className="compactProgress empty">geen checklist</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="planningCompactColumn">
          <div className="planningColumnHeader">
            <div>
              <span>To Do</span>
              <h2>Taken</h2>
            </div>
            <div className="planningTaskHeaderActions">
              <strong>{todoistTasks.length} open</strong>
              <PlanningTaskCreateButton
                projects={planning.allProjects
                  .filter((project) => project.number)
                  .map((project) => ({
                    number: String(project.number),
                    name: project.name,
                  }))
                  .sort((a, b) => a.number.localeCompare(b.number))}
              />
            </div>
          </div>

          <div className="planningAgendaList">
            {overdueTasks.length ? (
              <section className="planningAgendaDay planningOverdueDay" id="todo-today">
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
                        content={displayTaskContent(task, projectNumber)}
                        meta={projectNumber
                          ? `#${projectNumber} · ${projectByNumber.get(projectNumber)?.name ?? ''} · ${meta.text}`.replace(' ·  · ', ' · ')
                          : meta.text}
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
                            content={displayTaskContent(task, projectNumber)}
                            meta={projectNumber
                              ? `#${projectNumber} · ${projectByNumber.get(projectNumber)?.name ?? ''} · ${taskDate(task) ? meta.text : 'gekoppeld aan project'}`.replace(' ·  · ', ' · ')
                              : meta.text}
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

            {noDateTasks.length ? (
              <section className="planningAgendaDay">
                <div className="planningAgendaDayHeader">
                  <strong>Zonder deadline</strong>
                  <span>{noDateTasks.length} taken</span>
                </div>
                <div className="compactTaskList">
                  {noDateTasks.map((task) => {
                    const projectNumber = taskProjectNumber.get(task.id);
                    return (
                      <TodoistTaskItem
                        key={task.id}
                        id={task.id}
                        content={displayTaskContent(task, projectNumber)}
                        meta={projectNumber
                          ? `#${projectNumber} · ${projectByNumber.get(projectNumber)?.name ?? ''} · Geen deadline`.replace(' ·  · ', ' · ')
                          : 'Geen deadline'}
                        labels={task.labels}
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <aside className="planningOpsColumn">
          <section className="planningOpsCard planningCrewCard">
            <div className="planningOpsHeader">
              <span>Personeel (Rentman)</span>
              <strong>{weeklyCrewCount} deze week</strong>
            </div>

            <div className="planningCrewDays">
              {weekDays.map((dateKey) => {
                const assignments = crewByDay.get(dateKey) ?? [];
                if (!assignments.length) return null;

                return (
                  <section className="planningCrewDay" key={dateKey}>
                    <div className="planningCrewDayHeader">
                      <strong>{dayLongLabel(dateKey, planning.today)}</strong>
                      <span>{assignments.length} activiteiten</span>
                    </div>

                    <div className="planningCrewList">
                      {assignments.map((assignment) => {
                        const fn = assignment.function;
                        const crew = assignment.crewmember;
                        const start = fn?.planperiod_start ?? fn?.usageperiod_start ?? null;
                        const end = fn?.planperiod_end ?? fn?.usageperiod_end ?? null;
                        const projectId = Number(fn?.project?.split('/').pop());
                        const project = Number.isFinite(projectId) ? projectById.get(projectId) : undefined;
                        const name = crew?.displayname
                          || [crew?.firstname, crew?.middle_name, crew?.lastname].filter(Boolean).join(' ')
                          || 'Onbekend';
                        const initials = name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase())
                          .join('');

                        const locationAddress = project?.location
                          ? [
                              [project.location.visit_street, project.location.visit_number].filter(Boolean).join(' '),
                              [project.location.visit_postalcode, project.location.visit_city].filter(Boolean).join(' '),
                            ].filter(Boolean).join(', ')
                          : null;
                        const locationContact = project?.loc_contact;
                        const locationContactName = locationContact?.displayname
                          || [locationContact?.firstname, locationContact?.middle_name, locationContact?.lastname]
                            .filter(Boolean)
                            .join(' ')
                          || null;

                        return (
                          <CrewPlanningPopup
                            key={assignment.id}
                            assignmentId={assignment.id}
                            projectId={project?.id ?? null}
                            name={name}
                            initials={initials}
                            functionName={fn?.displayname || fn?.name || 'Crew'}
                            groupName={fn?.group?.displayname || fn?.group?.name || null}
                            start={start}
                            end={end}
                            projectNumber={project?.number ?? null}
                            projectName={project?.name ?? null}
                            locationName={project?.location?.displayname || project?.location?.name || null}
                            locationAddress={locationAddress}
                            contactName={locationContactName}
                            contactPhone={locationContact?.mobilephone || locationContact?.phone || null}
                            contactEmail={locationContact?.email || null}
                            notes={typeof project?.custom?.custom_103 === 'string' ? project.custom.custom_103 : null}
                            bar={typeof project?.custom?.custom_38 === 'string' ? project.custom.custom_38 : null}
                            vehicles={(project ? vehiclesByProjectId.get(project.id) ?? [] : []).map((item) => ({
                              id: item.id,
                              name: item.vehicle?.displayname || item.vehicle?.name || 'Voertuig',
                              licensePlate: item.vehicle?.licenseplate || null,
                              functionName: item.function?.displayname || item.function?.name || null,
                              start: item.function?.planperiod_start || item.function?.usageperiod_start || null,
                              end: item.function?.planperiod_end || item.function?.usageperiod_end || null,
                            }))}
                            timeline={project ? (() => {
                              const groups = functionGroupsByProjectId.get(project.id) ?? [];
                              const functions = functionsByProjectId.get(project.id) ?? [];
                              const timelineGroups = new Map<number | string, {
                                id: number;
                                name: string | null;
                                start: string | null;
                                end: string | null;
                                remark: string | null;
                              }>();

                              for (const group of groups) {
                                const groupFunctions = functions
                                  .filter((projectFunction) => projectFunction.group?.id === group.id)
                                  .map((projectFunction) => {
                                    const label = projectFunction.displayname || projectFunction.name || 'Functie';
                                    const amount = projectFunction.amount && projectFunction.amount > 1
                                      ? ` × ${projectFunction.amount}`
                                      : '';
                                    return `${label}${amount}`;
                                  });

                                timelineGroups.set(group.id, {
                                  id: group.id,
                                  name: group.displayname || group.name || null,
                                  start: group.planperiod_start || group.usageperiod_start || null,
                                  end: group.planperiod_end || group.usageperiod_end || null,
                                  remark: groupFunctions.length
                                    ? groupFunctions.join(' · ')
                                    : group.remark || null,
                                });
                              }

                              for (const projectFunction of functions) {
                                const group = projectFunction.group;
                                if (group?.id) {
                                  if (!timelineGroups.has(group.id)) {
                                    const label = projectFunction.displayname || projectFunction.name || 'Functie';
                                    const amount = projectFunction.amount && projectFunction.amount > 1
                                      ? ` × ${projectFunction.amount}`
                                      : '';
                                    timelineGroups.set(group.id, {
                                      id: group.id,
                                      name: group.displayname || group.name || label,
                                      start: group.planperiod_start || group.usageperiod_start
                                        || projectFunction.planperiod_start || projectFunction.usageperiod_start || null,
                                      end: group.planperiod_end || group.usageperiod_end
                                        || projectFunction.planperiod_end || projectFunction.usageperiod_end || null,
                                      remark: `${label}${amount}`,
                                    });
                                  }
                                  continue;
                                }

                                timelineGroups.set(`function-${projectFunction.id}`, {
                                  id: projectFunction.id,
                                  name: projectFunction.displayname || projectFunction.name || null,
                                  start: projectFunction.planperiod_start || projectFunction.usageperiod_start || null,
                                  end: projectFunction.planperiod_end || projectFunction.usageperiod_end || null,
                                  remark: projectFunction.amount && projectFunction.amount > 1
                                    ? `${projectFunction.amount} gepland`
                                    : null,
                                });
                              }

                              return [
                                {
                                  id: -(project.id * 10 + 1),
                                  name: 'Gebruiksperiode',
                                  start: project.usageperiod_start ?? null,
                                  end: project.usageperiod_end ?? null,
                                  remark: null,
                                },
                                {
                                  id: -(project.id * 10 + 2),
                                  name: 'Planperiode',
                                  start: project.planperiod_start ?? null,
                                  end: project.planperiod_end ?? null,
                                  remark: null,
                                },
                                ...Array.from(timelineGroups.values()),
                              ]
                                .filter((item) => item.start || item.end)
                                .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
                            })() : []}
                          />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!weekDays.some((dateKey) => (crewByDay.get(dateKey) ?? []).length > 0) ? (
                <div className="compactEmpty">Geen geplande personeelsactiviteiten in deze week.</div>
              ) : null}
            </div>
          </section>

          <section className="planningOpsCard planningExpiredCard">
            <div className="planningOpsHeader planningExpiredHeader">
              <div>
                <span>Verlopen bonnen</span>
                <small>
                  {rentmanReturnResult.configured
                    ? 'Projectperiode voorbij en retour in Rentman nog niet afgerond.'
                    : 'Retourstatus in Rentman is nog niet gekoppeld.'}
                </small>
              </div>
              <strong>{overdueReturnProjects.length}</strong>
            </div>

            {overdueReturnProjects.length ? (
              <div className="planningOpsList">
                {overdueReturnProjects.slice(0, 10).map((project) => {
                  const period = getPlanningProjectPeriod(project);
                  const daysLate = period.endDate && planning.today
                    ? Math.max(
                        1,
                        Math.floor(
                          (new Date(`${planning.today}T12:00:00+02:00`).getTime()
                            - new Date(`${period.endDate}T12:00:00+02:00`).getTime())
                          / (24 * 60 * 60 * 1000),
                        ),
                      )
                    : null;

                  return (
                    <div className="planningExpiredRow" key={project.id}>
                      <div>
                        <strong>#{project.number ?? project.id}</strong>
                        <span>{project.name}</span>
                      </div>
                      <div className="planningExpiredMeta">
                        <span>Verlopen {shortDate(period.endDate)}</span>
                        {daysLate ? <b>{daysLate} {daysLate === 1 ? 'dag' : 'dagen'}</b> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="compactEmpty">Geen verlopen bonnen.</div>
            )}
          </section>
        </aside>
      </section>
      </main>
    </>
  );
}
