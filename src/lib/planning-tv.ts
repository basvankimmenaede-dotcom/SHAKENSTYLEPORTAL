export const TV_AGENDA_DAYS = 30;
export const TV_AGENDA_TIME_ZONE = 'Europe/Amsterdam';

export type TvAgendaPeriod = {
  start: string;
  end: string;
  subprojectIds: number[];
  subprojectNames?: string[];
};

export type TvAgendaProject = {
  id: number;
  number: string | null;
  name: string;
  periods: TvAgendaPeriod[];
};

export type TvAgendaIssue = {
  projectId: number | null;
  number: string | null;
  name: string;
  reason: string;
  kind: 'missing_usage' | 'unknown_status' | 'ambiguous_usage' | 'missing_project';
  periods?: Array<{ start: string; end: string }>;
};

export type TvAgendaSnapshot = {
  fetchedAt: string;
  projects: TvAgendaProject[];
  issues: TvAgendaIssue[];
};

export type TvSourceProject = {
  id: number;
  number?: string | number | null;
  name: string;
  usageperiod_start?: unknown;
  usageperiod_end?: unknown;
};

export type TvSourceSubproject = {
  id: number;
  name: string;
  project?: unknown;
  status?: unknown;
  in_planning?: unknown;
  is_template?: unknown;
  usageperiod_start?: unknown;
  usageperiod_end?: unknown;
};

// TV includes Concept (8); exclude only Optie, Geannuleerd and Aanvraag.
// Evaluate per subproject: a cancelled sibling must not hide a confirmed job.
const EXCLUDED_STATUS_IDS = new Set([1, 2, 7]);

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TV_AGENDA_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TV_AGENDA_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function amsterdamDateKey(date: Date = new Date()): string {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarDateMs(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Ongeldige kalenderdatum.');
  const value = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== dateKey) {
    throw new Error('Ongeldige kalenderdatum.');
  }
  return value;
}

export function addCalendarDays(dateKey: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error('Ongeldig aantal kalenderdagen.');
  const date = new Date(calendarDateMs(dateKey));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Local midnight, including 23/25-hour days at daylight-saving changes. */
export function amsterdamDayStart(dateKey: string): number {
  const target = calendarDateMs(dateKey);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(dateTimeFormatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const localAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const next = target - (localAsUtc - candidate);
    if (next === candidate) return candidate;
    candidate = next;
  }
  return candidate;
}

/** Rentman timestamps must be real calendar dates with an explicit timezone. */
export function usageTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00', , zone] = match;
  try {
    calendarDateMs(`${year}-${month}-${day}`);
  } catch {
    return null;
  }
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone.toUpperCase() !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validUsage(start: unknown, end: unknown) {
  const from = usageTimestamp(start);
  const to = usageTimestamp(end);
  if (from === null || to === null || to <= from) return null;
  return { start: start as string, end: end as string, from, to };
}

export function rentmanReferenceId(value: unknown, resources: string[]): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (value && typeof value === 'object' && 'id' in value) {
    return rentmanReferenceId((value as { id: unknown }).id, resources);
  }
  if (typeof value !== 'string') return null;
  if (/^\d+$/.test(value)) return rentmanReferenceId(Number(value), resources);
  const match = /^\/([a-z]+)\/(\d+)\/?$/.exec(value);
  return match && resources.includes(match[1]) ? rentmanReferenceId(Number(match[2]), resources) : null;
}

function projectNumber(project?: TvSourceProject): string | null {
  return project?.number === null || project?.number === undefined || String(project.number).trim() === ''
    ? null : String(project.number);
}

/**
 * Only actual subproject usage is counted. Parent usage can scope a warning,
 * but never fills a missing subproject interval or joins a gap between periods.
 */
export function normalizeTvAgendaData(
  sourceProjects: TvSourceProject[],
  sourceSubprojects: TvSourceSubproject[],
  notBefore = Number.NEGATIVE_INFINITY,
): Pick<TvAgendaSnapshot, 'projects' | 'issues'> {
  const parents = new Map(sourceProjects.map((project) => [project.id, project]));
  const linkedParents = new Set<number>();
  const projects = new Map<number, TvAgendaProject>();
  const issues: TvAgendaIssue[] = [];
  const seenSubprojects = new Set<number>();

  for (const subproject of sourceSubprojects) {
    const parentId = rentmanReferenceId(subproject.project, ['projects']);
    if (parentId !== null) linkedParents.add(parentId);
    if (seenSubprojects.has(subproject.id)) continue;
    seenSubprojects.add(subproject.id);
    if (subproject.is_template === true || subproject.in_planning === false) continue;

    const parent = parentId === null ? undefined : parents.get(parentId);
    const usage = validUsage(subproject.usageperiod_start, subproject.usageperiod_end);
    const parentUsage = validUsage(parent?.usageperiod_start, parent?.usageperiod_end);
    if (usage && usage.to <= notBefore) continue;
    if (!usage && parentUsage && parentUsage.to <= notBefore) continue;

    const issuePeriods = usage ?? parentUsage;
    const issueBase = {
      projectId: parentId,
      number: projectNumber(parent),
      name: parent?.name ?? subproject.name,
      ...(issuePeriods ? { periods: [{ start: issuePeriods.start, end: issuePeriods.end }] } : {}),
    };
    const status = rentmanReferenceId(subproject.status, ['statuses', 'projectstatuses']);
    if (status !== null && EXCLUDED_STATUS_IDS.has(status)) continue;
    if (status === null || subproject.in_planning !== true || subproject.is_template !== false) {
      issues.push({
        ...issueBase,
        kind: 'unknown_status',
        reason: `Planningstatus van subproject '${subproject.name}' is niet volledig bekend; niet meegeteld.`,
      });
      continue;
    }
    if (!parent) {
      issues.push({ ...issueBase, kind: 'missing_project', reason: `Hoofdproject van subproject '${subproject.name}' ontbreekt; niet meegeteld.` });
      continue;
    }
    if (!usage) {
      issues.push({ ...issueBase, kind: 'missing_usage', reason: `Gebruiksperiode van subproject '${subproject.name}' ontbreekt of is ongeldig; niet meegeteld.` });
      continue;
    }

    let project = projects.get(parent.id);
    if (!project) {
      project = { id: parent.id, number: projectNumber(parent), name: parent.name, periods: [] };
      projects.set(parent.id, project);
    }
    const existing = project.periods.find((period) => Date.parse(period.start) === usage.from && Date.parse(period.end) === usage.to);
    if (existing) {
      existing.subprojectIds.push(subproject.id);
      if (!existing.subprojectNames?.includes(subproject.name)) existing.subprojectNames?.push(subproject.name);
    } else {
      project.periods.push({ start: usage.start, end: usage.end, subprojectIds: [subproject.id], subprojectNames: [subproject.name] });
    }
  }

  for (const parent of sourceProjects) {
    if (linkedParents.has(parent.id)) continue;
    const usage = validUsage(parent.usageperiod_start, parent.usageperiod_end);
    if (usage && usage.to <= notBefore) continue;
    issues.push({
      projectId: parent.id,
      number: projectNumber(parent),
      name: parent.name,
      kind: 'unknown_status',
      reason: 'Geen subproject met controleerbare planningstatus gevonden; niet meegeteld.',
      ...(usage ? { periods: [{ start: usage.start, end: usage.end }] } : {}),
    });
  }

  for (const project of projects.values()) {
    project.periods.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end));
    for (const period of project.periods) {
      period.subprojectIds.sort((a, b) => a - b);
      period.subprojectNames?.sort((a, b) => a.localeCompare(b, 'nl'));
    }
    if (project.periods.length > 1) {
      const names = Array.from(new Set(project.periods.flatMap((period) => period.subprojectNames ?? [])));
      issues.push({
        projectId: project.id,
        number: project.number,
        name: project.name,
        kind: 'ambiguous_usage',
        reason: `Meerdere gebruiksperiodes bij subprojecten: ${names.join('; ')}. Alle echte gebruiksperiodes tellen mee; controleer welke onderdelen bij het evenement horen.`,
        periods: project.periods.map(({ start, end }) => ({ start, end })),
      });
    }
  }

  return {
    projects: Array.from(projects.values()).sort((a, b) => a.id - b.id),
    issues: issues.sort((a, b) => (a.projectId ?? 0) - (b.projectId ?? 0) || a.kind.localeCompare(b.kind)),
  };
}

export function buildTvAgendaWindow(snapshot: TvAgendaSnapshot, today: string) {
  const boundaries = Array.from({ length: TV_AGENDA_DAYS + 1 }, (_, index) => amsterdamDayStart(addCalendarDays(today, index)));
  const days = Array.from({ length: TV_AGENDA_DAYS }, (_, index) => ({ date: addCalendarDays(today, index), projectIds: [] as number[] }));
  const projects = snapshot.projects.filter((project) => project.periods.some((period) =>
    Date.parse(period.start) < boundaries[TV_AGENDA_DAYS] && Date.parse(period.end) > boundaries[0],
  ));
  projects.sort((a, b) => {
    const first = (project: TvAgendaProject) => Math.min(...project.periods
      .filter((period) => Date.parse(period.end) > boundaries[0])
      .map((period) => Date.parse(period.start)));
    return first(a) - first(b) || (a.number ?? '').localeCompare(b.number ?? '', 'nl', { numeric: true }) || a.id - b.id;
  });
  for (let index = 0; index < TV_AGENDA_DAYS; index += 1) {
    days[index].projectIds = Array.from(new Set(projects.filter((project) => project.periods.some((period) =>
      Date.parse(period.start) < boundaries[index + 1] && Date.parse(period.end) > boundaries[index],
    )).map((project) => project.id)));
  }
  return { days, projects, total: new Set(projects.map((project) => project.id)).size };
}
