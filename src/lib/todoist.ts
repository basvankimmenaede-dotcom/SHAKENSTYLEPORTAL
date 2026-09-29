import { revalidateTag } from 'next/cache';

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
    next: { revalidate: 30, tags: ['todoist-planning'] },
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


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeTaskWithRest(taskId: string) {
  const url = `${TODOIST_API_BASE}/tasks/${encodeURIComponent(taskId)}/close`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${todoistToken()}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      revalidateTag('todoist-planning');
      return;
    }

    if (![502, 503, 504].includes(response.status)) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Todoist-taak kon niet worden afgerond (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}.`,
      );
    }

    if (attempt < 2) await sleep(250 * (attempt + 1));
  }

  throw new Error('Todoist REST tijdelijk niet beschikbaar.');
}

async function closeTaskWithSync(taskId: string) {
  const commandId = crypto.randomUUID();
  const commands = JSON.stringify([
    {
      type: 'item_close',
      uuid: commandId,
      args: { id: taskId },
    },
  ]);

  const body = new URLSearchParams({ commands });
  const response = await fetch(`${TODOIST_API_BASE}/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${todoistToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Todoist fallback kon taak niet afronden (${response.status}).`);
  }

  const result = await response.json() as {
    sync_status?: Record<string, string | { error?: string }>;
  };
  const status = result.sync_status?.[commandId];

  if (status !== 'ok') {
    const detail = typeof status === 'object' && status?.error ? status.error : 'onbekende fout';
    throw new Error(`Todoist fallback kon taak niet afronden: ${detail}.`);
  }

  revalidateTag('todoist-planning');
}

export async function completePlanningTodoistTask(taskId: string) {
  try {
    await closeTaskWithRest(taskId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('tijdelijk niet beschikbaar')) throw error;
    await closeTaskWithSync(taskId);
  }
}


export async function createPlanningTodoistTask({
  content,
  dueDate,
  description,
}: {
  content: string;
  dueDate?: string | null;
  description?: string;
}) {
  const projectId = process.env.TODOIST_PLANNING_PROJECT_ID || DEFAULT_PLANNING_PROJECT_ID;
  const response = await fetch(`${TODOIST_API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${todoistToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      description: description ?? '',
      project_id: projectId,
      ...(dueDate ? { due_date: dueDate } : {}),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Todoist-taak kon niet worden aangemaakt (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}.`,
    );
  }

  const task = await response.json() as TodoistTask;
  revalidateTag('todoist-planning');
  return task;
}
