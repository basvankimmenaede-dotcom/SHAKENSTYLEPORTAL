const TODOIST_API_BASE = 'https://api.todoist.com/api/v1';
const DEFAULT_PLANNING_PROJECT_ID = '6hfMXMXm6FR5ccRC';

function todoistToken() {
  const value = process.env.TODOIST_API_TOKEN;
  if (!value) throw new Error('TODOIST_API_TOKEN is not configured.');
  return value;
}

export type TodoistTask = {
  id: string;
  content: string;
  description?: string;
  project_id: string;
  section_id?: string | null;
  parent_id?: string | null;
  labels?: string[];
  priority?: number;
  responsible_uid?: string | null;
  due?: {
    date: string;
    string?: string;
    is_recurring?: boolean;
  } | null;
  deadline?: {
    date: string;
  } | null;
};

type TodoistListResponse<T> = {
  results?: T[];
  next_cursor?: string | null;
};

async function todoistFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${TODOIST_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${todoistToken()}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Todoist-verbinding mislukt (${response.status}).`);
  }

  return response.json();
}

export async function getPlanningTodoistTasks() {
  const projectId = process.env.TODOIST_PLANNING_PROJECT_ID || DEFAULT_PLANNING_PROJECT_ID;
  const tasks: TodoistTask[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({
      project_id: projectId,
      limit: '200',
    });
    if (cursor) params.set('cursor', cursor);

    const result = await todoistFetch<TodoistListResponse<TodoistTask>>(
      `/tasks?${params.toString()}`,
    );
    tasks.push(...(result.results ?? []));
    cursor = result.next_cursor ?? null;
    pageCount += 1;

    if (pageCount > 20) throw new Error('Te veel Todoist-pagina’s om veilig te laden.');
  } while (cursor);

  return tasks;
}

export function todoistTaskDate(task: TodoistTask) {
  const deadlineDate = task.deadline?.date ?? null;
  const dueDate = task.due?.date ?? null;
  const sortDate = deadlineDate ?? dueDate;
  return { deadlineDate, dueDate, sortDate };
}

export function findRentmanProjectNumber(
  task: TodoistTask,
  knownProjectNumbers: Set<string>,
) {
  const haystack = `${task.content} ${task.description ?? ''}`;
  const candidates = haystack.match(/\b\d{3,8}\b/g) ?? [];
  return candidates.find((candidate) => knownProjectNumbers.has(candidate)) ?? null;
}
