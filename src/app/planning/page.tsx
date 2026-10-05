import Link from 'next/link';
import { getUserPermissionLevel, permissionAtLeast, requirePlanningUser } from '@/lib/auth';
import { syncBillingQueueOncePerDay } from '@/lib/billing';
import {
  getPlanningProjects,
  getPlanningProjectPeriod,
  getPlanningCrewAssignments,
  getPlanningProjectEquipmentGroups,
  getOverdueReturnProjects as getRentmanOverdueReturnProjects,
  type RentmanPlanningProject,
  type RentmanPlanningCrewAssignment,
} from '@/lib/rentman';
import {
  createPlanningTodoistTask,
  findRentmanProjectNumber,
  getPlanningTodoistTasks,
  todoistTaskDate,
  type TodoistTask,
} from '@/lib/todoist';
import ProjectChecklist, {
  type ChecklistTemplate,
  type PlanningChecklist,
} from '@/components/ProjectChecklist';
import ProjectChecklistProgress from '@/components/ProjectChecklistProgress';
import TodoistTaskItem from '@/components/TodoistTaskItem';
import PlanningAutoRefresh from '@/components/PlanningAutoRefresh';
import CrewPlanningPopup from '@/components/CrewPlanningPopup';
import PlanningTaskCreateButton from '@/components/PlanningTaskCreateButton';
import PlanningTaskFilterControls from '@/components/PlanningTaskFilterControls';
import PlanningTaskDragManager from '@/components/PlanningTaskDragManager';
import { createAdminClient } from '@/lib/supabase/admin';
import { amsterdamDateKey, isWeekend } from '@/lib/closingChecklist';

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

function projectOverlapsUsageDate(
  project: RentmanPlanningProject,
  dateKey: string,
  range: { startDate: string | null; endDate: string | null },
) {
  if (!range.startDate || !range.endDate) return false;
  return range.startDate <= dateKey && range.endDate >= dateKey;
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
    urgent: overdue || isToday || task.priority === 4,
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
  const period = {
    start: project.usageperiod_start ?? project.planperiod_start ?? null,
    end: project.usageperiod_end ?? project.planperiod_end ?? null,
    startDate: (project.usageperiod_start ?? project.planperiod_start)?.slice(0, 10) ?? null,
    endDate: (project.usageperiod_end ?? project.planperiod_end)?.slice(0, 10) ?? null,
  };
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
          {progress && checklist ? (
            <ProjectChecklistProgress checklistId={checklist.id} initialDone={progress.done} total={progress.total} />
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
  const { supabase, user, profile } = await requirePlanningUser();
  const admin = createAdminClient();

  let rentmanError: string | null = null;
  let todoistError: string | null = null;

  const [planningResult, todoistResult, crewResult, equipmentGroupsResult, checklistResult, templateResult, profilesResult, taskAssignmentsResult, planningSettingsResult] = await Promise.all([
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
    getPlanningProjectEquipmentGroups()
      .then((value) => ({ value, error: null as string | null }))
      .catch(() => ({ value: [], error: null as string | null })),
    supabase
      .from('project_checklists')
      .select('id,rentman_project_id,rentman_project_number,status,template_id,project_checklist_items(id,label,completed,is_required,sort_order,deadline_offset_days,due_date,todoist_task_id,task_area)'),
    supabase
      .from('checklist_templates')
      .select('id,name,rentman_project_type_id')
      .eq('is_active', true)
      .order('name'),
    admin
      .from('profiles')
      .select('id,full_name,role')
      .in('role', ['admin', 'warehouse'])
      .order('full_name'),
    supabase
      .from('planning_task_assignments')
      .select('todoist_task_id,assignee_profile_id,task_area'),
    supabase
      .from('planning_settings')
      .select('fuel_card_distance_km,recurring_tasks')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const planning = planningResult.value;
  const allTodoistTasks = todoistResult.value;
  const crewAssignments = crewResult.value;
  const equipmentGroups = equipmentGroupsResult.value;
  const fuelCardDistanceKm = Number(planningSettingsResult.data?.fuel_card_distance_km ?? 150);
  type RecurringTaskSetting = {
    title?: string;
    active?: boolean;
    task_area?: 'office' | 'warehouse' | 'both';
  };
  const recurringTaskSettings = (planningSettingsResult.data?.recurring_tasks ?? {}) as Record<string, RecurringTaskSetting>;
  const closingRecurring: RecurringTaskSetting = recurringTaskSettings.closing ?? {
    title: 'Afsluitlijst afronden',
    active: true,
    task_area: 'both',
  };
  rentmanError = planningResult.error;
  todoistError = todoistResult.error;

  const [billingLevel, checklistLevel] = profile.role === 'admin'
    ? ['manage', 'manage'] as const
    : await Promise.all([
        getUserPermissionLevel(supabase, user.id, 'billing'),
        getUserPermissionLevel(supabase, user.id, 'checklists'),
      ]);
  const canSeeBilling = permissionAtLeast(billingLevel, 'view');
  const canManageBilling = permissionAtLeast(billingLevel, 'manage');
  const canSeeClosing = permissionAtLeast(checklistLevel, 'view');

  const closingTodayDate = amsterdamDateKey();
  const [{ data: closingSettings }, { data: closingExemption }] = await Promise.all([
    supabase.from('closing_checklist_settings').select('required_from_date').eq('id', 1).maybeSingle(),
    supabase.from('closing_checklist_exemptions').select('reason').eq('checklist_date', closingTodayDate).maybeSingle(),
  ]);
  const closingRequired = canSeeClosing
    && !isWeekend(closingTodayDate)
    && !closingExemption
    && closingTodayDate >= String(closingSettings?.required_from_date ?? closingTodayDate);

  if (closingRequired) {
    await supabase.rpc('ensure_closing_checklist', { p_date: closingTodayDate });
  }

  const { data: closingToday } = closingRequired
    ? await supabase
        .from('closing_checklists')
        .select('id,status,todoist_task_id,closing_checklist_items(id,completed,item_type)')
        .eq('checklist_date', closingTodayDate)
        .maybeSingle()
    : { data: null };

  const closingTodayItems = (closingToday?.closing_checklist_items ?? []).filter((item) => item.item_type !== 'heading');
  const closingTodayDone = closingTodayItems.filter((item) => item.completed).length;
  const closingTodayTotal = closingTodayItems.length;

  let ensuredClosingTaskId: string | null = null;
  if (closingRecurring.active !== false && closingRequired && closingToday && closingToday.status !== 'completed') {
    try {
      const marker = `SHAKENSTYLE afsluitlijst · ${closingTodayDate}`;
      const linkedTaskId = closingToday.todoist_task_id ? String(closingToday.todoist_task_id) : null;
      let closingTask = linkedTaskId
        ? allTodoistTasks.find((task) => String(task.id) === linkedTaskId) ?? null
        : null;

      if (!closingTask) {
        closingTask = allTodoistTasks.find((task) => String(task.description ?? '').includes(marker)) ?? null;
      }

      if (!closingTask) {
        closingTask = await createPlanningTodoistTask({
          content: String(closingRecurring.title || 'Afsluitlijst afronden'),
          dueDate: closingTodayDate,
          description: marker,
        });
        allTodoistTasks.push(closingTask);
      }

      ensuredClosingTaskId = String(closingTask.id);

      if (linkedTaskId !== ensuredClosingTaskId) {
        await supabase
          .from('closing_checklists')
          .update({ todoist_task_id: ensuredClosingTaskId })
          .eq('id', closingToday.id);
      }

      await supabase
        .from('planning_task_assignments')
        .upsert({
          todoist_task_id: ensuredClosingTaskId,
          assignee_profile_id: null,
          assigned_by: user.id,
          task_area: ['office', 'warehouse', 'both'].includes(String(closingRecurring.task_area))
            ? String(closingRecurring.task_area)
            : 'both',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'todoist_task_id' });
    } catch {
      // Planning blijft bruikbaar als Todoist tijdelijk niet bereikbaar is.
    }
  }

  if (canManageBilling && planning.allProjects.length) {
    await syncBillingQueueOncePerDay({
      supabase,
      projects: planning.allProjects,
      equipmentGroups,
      userId: user.id,
      today: planning.today,
    }).catch(() => undefined);
  }

  const billingSummary = canSeeBilling
    ? await supabase
        .from('billing_items')
        .select('usage_end,created_at')
        .eq('status', 'open')
        .order('usage_end', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
    : { data: [] as Array<{ usage_end: string | null; created_at: string }> };
  const openBillingItems = billingSummary.data ?? [];
  const oldestBillingDate = openBillingItems[0]?.usage_end ?? openBillingItems[0]?.created_at ?? null;
  const oldestBillingDays = oldestBillingDate
    ? Math.max(0, Math.floor((Date.now() - new Date(oldestBillingDate).getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  const checklists = (checklistResult.data ?? []) as ChecklistRow[];

  // Keep project checklist completion in sync with Todoist.
  // A linked task that is present in the active Todoist task list is open;
  // if it is no longer active, it has been completed in Todoist.
  const openTodoistTaskIds = new Set(allTodoistTasks.map((task) => String(task.id)));
  const checklistSyncUpdates: Array<{ id: number; completed: boolean }> = [];

  for (const checklist of checklists) {
    for (const item of checklist.project_checklist_items ?? []) {
      if (!item.todoist_task_id) continue;
      const shouldBeCompleted = !openTodoistTaskIds.has(String(item.todoist_task_id));
      if (Boolean(item.completed) !== shouldBeCompleted) {
        checklistSyncUpdates.push({ id: Number(item.id), completed: shouldBeCompleted });
        item.completed = shouldBeCompleted;
      }
    }
  }

  if (checklistSyncUpdates.length) {
    await Promise.all(
      checklistSyncUpdates.map(({ id, completed }) =>
        admin
          .from('project_checklist_items')
          .update({
            completed,
            completed_at: completed ? new Date().toISOString() : null,
            completed_by: null,
          })
          .eq('id', id),
      ),
    );
  }

  const templates = (templateResult.data ?? []) as ChecklistTemplate[];
  const assignees = (profilesResult.data ?? []).map((profile) => ({
    id: String(profile.id),
    name: String(profile.full_name || 'Onbekend').replace(/@shakenstyle\.com$/i, ''),
    role: profile.role as 'admin' | 'warehouse',
  }));
  const taskAssigneeById = new Map(
    (taskAssignmentsResult.data ?? []).map((row) => [
      String(row.todoist_task_id),
      row.assignee_profile_id ? String(row.assignee_profile_id) : null,
    ]),
  );
  const taskAreaById = new Map(
    (taskAssignmentsResult.data ?? []).map((row) => [
      String(row.todoist_task_id),
      row.task_area === 'warehouse' ? 'warehouse' : row.task_area === 'both' ? 'both' : 'office',
    ] as const),
  );
  if (ensuredClosingTaskId) taskAreaById.set(ensuredClosingTaskId, 'both');
  const todoistTasks = profile.role === 'warehouse'
    ? allTodoistTasks.filter((task) => {
        const area = taskAreaById.get(task.id);
        return area === 'warehouse' || area === 'both';
      })
    : allTodoistTasks;

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
    ? Array.from({ length: 10 }, (_, index) => addDays(planning.today, index))
    : [];

  const projectById = new Map(planning.allProjects.map((project) => [project.id, project]));
  const projectByNumber = new Map(
    planning.allProjects
      .filter((project) => project.number)
      .map((project) => [String(project.number), project]),
  );

  const equipmentGroupsByProjectId = new Map<number, typeof equipmentGroups>();
  for (const group of equipmentGroups) {
    const projectId = Number(group.project?.split('/').pop());
    if (!Number.isFinite(projectId)) continue;
    const current = equipmentGroupsByProjectId.get(projectId) ?? [];
    current.push(group);
    equipmentGroupsByProjectId.set(projectId, current);
  }

  function agendaUsageRange(project: RentmanPlanningProject) {
    const groups = equipmentGroupsByProjectId.get(project.id) ?? [];
    const usableGroups = groups.filter((group) => group.usageperiod_start && group.usageperiod_end);

    if (usableGroups.length) {
      const counts = new Map<string, { start: string; end: string; count: number }>();
      for (const group of usableGroups) {
        const start = String(group.usageperiod_start);
        const end = String(group.usageperiod_end);
        const key = `${start}|${end}`;
        const current = counts.get(key);
        counts.set(key, current ? { ...current, count: current.count + 1 } : { start, end, count: 1 });
      }

      const mostUsed = Array.from(counts.values())
        .sort((a, b) => b.count - a.count || a.start.localeCompare(b.start))[0];

      if (mostUsed) {
        return {
          start: mostUsed.start,
          end: mostUsed.end,
          startDate: mostUsed.start.slice(0, 10),
          endDate: mostUsed.end.slice(0, 10),
        };
      }
    }

    const start = project.usageperiod_start ?? null;
    const end = project.usageperiod_end ?? start;
    return {
      start,
      end,
      startDate: start?.slice(0, 10) ?? null,
      endDate: end?.slice(0, 10) ?? null,
    };
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

  const crewGroupsByDay = new Map<string, RentmanPlanningCrewAssignment[][]>();
  for (const dateKey of weekDays) {
    const grouped = new Map<string, RentmanPlanningCrewAssignment[]>();
    for (const assignment of crewByDay.get(dateKey) ?? []) {
      const fn = assignment.function;
      const start = fn?.planperiod_start ?? fn?.usageperiod_start ?? '';
      const end = fn?.planperiod_end ?? fn?.usageperiod_end ?? '';
      const project = fn?.project ?? '';
      const functionName = fn?.displayname ?? fn?.name ?? '';
      const groupName = fn?.group?.displayname ?? fn?.group?.name ?? '';
      const key = [project, start, end, functionName, groupName].join('|');
      const current = grouped.get(key) ?? [];
      current.push(assignment);
      grouped.set(key, current);
    }
    crewGroupsByDay.set(dateKey, Array.from(grouped.values()));
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
        .filter((project) => !isLongTermRental(project) && projectOverlapsUsageDate(project, dateKey, agendaUsageRange(project)))
        .sort((a, b) => {
          const aStart = agendaUsageRange(a).start ?? '';
          const bStart = agendaUsageRange(b).start ?? '';
          return aStart.localeCompare(bStart);
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
        .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1) || taskMeta(a, planning.today).sort.localeCompare(taskMeta(b, planning.today).sort)),
    );
  }

  const overdueTasks = todoistTasks
    .filter((task) => {
      const date = taskDate(task);
      return Boolean(date && planning.today && date < planning.today);
    })
    .sort((a, b) => (taskDate(a) ?? '').localeCompare(taskDate(b) ?? '') || (b.priority ?? 1) - (a.priority ?? 1));

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



  const noDateTasks = todoistTasks
    .filter((task) => !taskDate(task))
    .slice(0, 40);

  const rentmanReturnResult = planning.today
    ? getRentmanOverdueReturnProjects(planning.allProjects, planning.today)
    : { configured: false, projects: [] as RentmanPlanningProject[] };
  const overdueReturnProjects = rentmanReturnResult.projects;

  const crewPreviewDays = weekDays.slice(0, 3);
  const previewCrewCount = crewPreviewDays.reduce(
    (sum, dateKey) => sum + (crewByDay.get(dateKey)?.length ?? 0),
    0,
  );
  const tenDayProjectCount = new Set(
    weekDays.flatMap((dateKey) => (projectsByDay.get(dateKey) ?? []).map((project) => project.id)),
  ).size;
  const todayTaskCount = (tasksByDay.get(planning.today) ?? []).length;
  const todayCrewCount = (crewByDay.get(planning.today) ?? []).length;


  return (
    <>
      <PlanningAutoRefresh intervalMs={300000} />
      <PlanningTaskDragManager />
      <main className="container planningPage planningCompactPage">
      <section className="planningCompactHeader">
        <div>
          <div className="eyebrowLink">Interne planning</div>
          <h1>Planning</h1>
        </div>
        <div className="planningCompactActions">
          <Link href="/planning/tv" className="button secondary">TV-weergave</Link>
        </div>
      </section>

      {rentmanError ? <div className="notice">Rentman: {rentmanError}</div> : null}
      {todoistError ? <div className="notice">Todoist: {todoistError}</div> : null}

      <section className="planningMetricStrip">
        <a className="planningMetricCard" href="#planning-projects">
          <span className="planningMetricIcon projects">P</span>
          <div><small>Projecten</small><strong>{tenDayProjectCount}</strong><em>komende 10 dagen</em></div>
        </a>
        <a className="planningMetricCard" href="#planning-task-list">
          <span className="planningMetricIcon tasks">✓</span>
          <div><small>Taken vandaag</small><strong>{todayTaskCount}</strong><em>{overdueTasks.length ? `${overdueTasks.length} te laat` : 'geen achterstand'}</em></div>
        </a>
        <a className="planningMetricCard" href="#planning-crew">
          <span className="planningMetricIcon crew">M</span>
          <div><small>Crew vandaag</small><strong>{todayCrewCount}</strong><em>{previewCrewCount} komende 3 dagen</em></div>
        </a>
        <div className="planningMetricCard">
          <span className="planningMetricIcon returns">↩</span>
          <div><small>Niet retour</small><strong>{overdueReturnProjects.length}</strong><em>{overdueReturnProjects.length ? 'openstaand' : 'alles retour'}</em></div>
        </div>
        {canSeeBilling ? (
          <a className="planningMetricCard" href="/planning/billing">
            <span className="planningMetricIcon billing">€</span>
            <div><small>Facturatie</small><strong>{openBillingItems.length}</strong><em>{openBillingItems.length ? 'openstaand' : 'bijgewerkt'}</em></div>
          </a>
        ) : null}
        {closingRequired ? (
          <a className="planningMetricCard" href="/planning/afsluitlijst">
            <span className="planningMetricIcon closing">✓</span>
            <div><small>Afsluitlijst</small><strong>{closingTodayDone}/{closingTodayTotal}</strong><em>{closingToday?.status === 'completed' ? 'afgerond' : 'vandaag afronden'}</em></div>
          </a>
        ) : null}
      </section>
      <section className="planningCompactGrid">
        <div className="planningCompactColumn" id="planning-projects">
          <div className="planningColumnHeader">
            <div>
              <span>Rentman</span>
              <h2>Projecten agenda</h2>
            </div>
            <strong>10 dagen</strong>
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
                        {checklistProgress(getChecklist(project)) && getChecklist(project) ? (
                          <ProjectChecklistProgress
                            checklistId={getChecklist(project)!.id}
                            initialDone={checklistProgress(getChecklist(project))!.done}
                            total={checklistProgress(getChecklist(project))!.total}
                          />
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

        <div className="planningTaskBillingColumn">
          <section className="planningCompactColumn">
          <div className="planningColumnHeader planningTaskColumnHeader">
            <div>
              <span>To Do</span>
              <h2>Taken</h2>
            </div>
            <div className="planningTaskHeaderActions">
              <PlanningTaskFilterControls canSeeOffice={profile.role === 'admin'} />
              <strong data-open-task-count>{todoistTasks.length} open</strong>
              <PlanningTaskCreateButton
                assignees={assignees}
                canChooseOffice={profile.role === 'admin'}
                projects={planning.allProjects
                  .filter((project) => project.number)
                  .sort((a, b) => {
                    const aDate = a.usageperiod_start ?? a.planperiod_start ?? '';
                    const bDate = b.usageperiod_start ?? b.planperiod_start ?? '';
                    return bDate.localeCompare(aDate);
                  })
                  .map((project) => ({
                    number: String(project.number),
                    name: project.name,
                  }))}
              />
            </div>
          </div>

          <div className="planningAgendaList" id="planning-task-list">
            {overdueTasks.length ? (
              <section className="planningAgendaDay planningOverdueDay" id="todo-today" data-task-section="overdue">
                <div className="planningAgendaDayHeader">
                  <strong>Te laat</strong>
                  <span data-task-count-label>{overdueTasks.length} {overdueTasks.length === 1 ? 'taak' : 'taken'}</span>
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
                        rawContent={task.content}
                        dueDate={taskDate(task) ?? ''}
                        useDeadline={Boolean(task.deadline?.date)}
                        meta={projectNumber
                          ? `#${projectNumber} · ${projectByNumber.get(projectNumber)?.name ?? ''} · ${meta.text}`.replace(' ·  · ', ' · ')
                          : meta.text}
                        labels={task.labels}
                        assignees={assignees}
                        assigneeProfileId={taskAssigneeById.get(task.id) ?? ''}
                        currentUserId={user.id}
                        priority={task.priority ?? 1}
                        taskArea={taskAreaById.get(task.id) ?? 'office'}
                        canChooseOffice={profile.role === 'admin'}
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
                <section className="planningAgendaDay" key={dateKey} data-task-section="dated" data-task-drop-date={dateKey}>
                  <div className="planningAgendaDayHeader">
                    <strong>{dayLongLabel(dateKey, planning.today)}</strong>
                    <span data-task-count-label>{tasks.length} {tasks.length === 1 ? 'taak' : 'taken'}</span>
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
                        rawContent={task.content}
                        dueDate={taskDate(task) ?? ''}
                        useDeadline={Boolean(task.deadline?.date)}
                            meta={projectNumber
                              ? `#${projectNumber} · ${projectByNumber.get(projectNumber)?.name ?? ''} · ${taskDate(task) ? meta.text : 'gekoppeld aan project'}`.replace(' ·  · ', ' · ')
                              : meta.text}
                            labels={task.labels}
                            assignees={assignees}
                            assigneeProfileId={taskAssigneeById.get(task.id) ?? ''}
                            currentUserId={user.id}
                        priority={task.priority ?? 1}
                        taskArea={taskAreaById.get(task.id) ?? 'office'}
                        canChooseOffice={profile.role === 'admin'}
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
              <section className="planningAgendaDay" data-task-section="nodate" data-task-drop-date="none">
                <div className="planningAgendaDayHeader">
                  <strong>Zonder deadline</strong>
                  <span data-task-count-label>{noDateTasks.length} {noDateTasks.length === 1 ? 'taak' : 'taken'}</span>
                </div>
                <div className="compactTaskList">
                  {noDateTasks.map((task) => {
                    const projectNumber = taskProjectNumber.get(task.id);
                    return (
                      <TodoistTaskItem
                        key={task.id}
                        id={task.id}
                        content={displayTaskContent(task, projectNumber)}
                        rawContent={task.content}
                        dueDate={taskDate(task) ?? ''}
                        useDeadline={Boolean(task.deadline?.date)}
                        meta={projectNumber
                          ? `#${projectNumber} · ${projectByNumber.get(projectNumber)?.name ?? ''} · Geen deadline`.replace(' ·  · ', ' · ')
                          : 'Geen deadline'}
                        labels={task.labels}
                        assignees={assignees}
                        assigneeProfileId={taskAssigneeById.get(task.id) ?? ''}
                        currentUserId={user.id}
                        priority={task.priority ?? 1}
                        taskArea={taskAreaById.get(task.id) ?? 'office'}
                        canChooseOffice={profile.role === 'admin'}
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          </section>

          {canSeeBilling ? (
            <section className="planningCompactColumn planningBillingStandalone">
              <div className="planningColumnHeader planningBillingStandaloneHeader">
                <div>
                  <span>Financieel</span>
                  <h2>Facturatie</h2>
                </div>
                <strong>{openBillingItems.length} open</strong>
              </div>
              <div className="planningBillingCard">
                <div className="planningBillingCardHeader">
                  <div>
                    <h3>{openBillingItems.length ? `${openBillingItems.length} openstaand` : 'Alles bijgewerkt ✓'}</h3>
                    {oldestBillingDays !== null && openBillingItems.length ? (
                      <span>Oudste {oldestBillingDays} {oldestBillingDays === 1 ? 'dag' : 'dagen'}</span>
                    ) : null}
                  </div>
                </div>
                <p>
                  {openBillingItems.length
                    ? 'Blijvende facturatiewerkvoorraad. Regels verdwijnen pas wanneer je ze zelf afhandelt.'
                    : 'Er staan momenteel geen projecten open om te factureren.'}
                </p>
                <Link className="planningBillingOpen" href="/planning/billing">
                  Open facturatielijst →
                </Link>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="planningOpsColumn">
          <section className="planningOpsCard planningCrewCard" id="planning-crew">
            <div className="planningOpsHeader">
              <span>Personeel (Rentman)</span>
              <strong>{previewCrewCount} komende 3 dagen</strong>
            </div>

            <div className="planningCrewDays">
              {crewPreviewDays.map((dateKey) => {
                const assignmentGroups = crewGroupsByDay.get(dateKey) ?? [];
                if (!assignmentGroups.length) return null;

                return (
                  <section className="planningCrewDay" key={dateKey}>
                    <div className="planningCrewDayHeader">
                      <strong>{dayLongLabel(dateKey, planning.today)}</strong>
                      <span>{assignmentGroups.length} activiteiten</span>
                    </div>

                    <div className="planningCrewList">
                      {assignmentGroups.map((assignmentGroup) => {
                        const assignment = assignmentGroup[0];
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
                        const people = assignmentGroup.map((groupAssignment) => {
                          const groupCrew = groupAssignment.crewmember;
                          const groupName = groupCrew?.displayname
                            || [groupCrew?.firstname, groupCrew?.middle_name, groupCrew?.lastname].filter(Boolean).join(' ')
                            || 'Onbekend';
                          return {
                            name: groupName,
                            initials: groupName
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase())
                              .join(''),
                          };
                        });

                        const locationAddress = project?.location
                          ? [
                              [project.location.visit_street, project.location.visit_number].filter(Boolean).join(' '),
                              [project.location.visit_postalcode, project.location.visit_city].filter(Boolean).join(' '),
                            ].filter(Boolean).join(', ')
                          : null;
                        const oneWayDistanceKm = Number(project?.location?.distance ?? 0);
                        const roundTripDistanceKm = oneWayDistanceKm > 0 ? Math.round(oneWayDistanceKm * 2) : null;
                        const fuelCardRequired = roundTripDistanceKm !== null && roundTripDistanceKm > fuelCardDistanceKm;

                        const locationContact = project?.loc_contact;
                        const locationContactName = locationContact?.displayname
                          || [locationContact?.firstname, locationContact?.middle_name, locationContact?.lastname]
                            .filter(Boolean)
                            .join(' ')
                          || null;

                        return (
                          <CrewPlanningPopup
                            key={assignmentGroup.map((item) => item.id).join('-')}
                            assignmentId={assignment.id}
                            projectId={project?.id ?? null}
                            name={name}
                            initials={initials}
                            people={people}
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
                            projectUsageStart={project?.usageperiod_start ?? null}
                            projectUsageEnd={project?.usageperiod_end ?? null}
                            projectPlanStart={project?.planperiod_start ?? null}
                            projectPlanEnd={project?.planperiod_end ?? null}
                            fuelCardRequired={fuelCardRequired}
                            roundTripDistanceKm={roundTripDistanceKm}
                            fuelCardThresholdKm={fuelCardDistanceKm}
                          />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!weekDays.some((dateKey) => (crewByDay.get(dateKey) ?? []).length > 0) ? (
                <div className="compactEmpty">Geen geplande personeelsactiviteiten in de komende 10 dagen.</div>
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
