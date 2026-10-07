import Link from 'next/link';
import OpenShiftsExport, { type BartenderExportRow } from '@/components/OpenShiftsExport';
import { requirePlanningUser } from '@/lib/auth';
import {
  getPlanningCrewAssignmentsForRange,
  getPlanningProjectFunctionsForRange,
  getPlanningProjects,
  type RentmanPlanningProject,
} from '@/lib/rentman';
import styles from './page.module.css';

type SearchParams = Record<string, string | string[] | undefined>;
type ShiftStatus = 'open' | 'critical' | 'filled';

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function valuesOf(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function validDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function projectIdFromPath(value?: string | null) {
  if (!value) return null;
  const id = Number(value.split('/').pop());
  return Number.isFinite(id) ? id : null;
}

function functionDate(functionItem: {
  planperiod_start?: string | null;
  usageperiod_start?: string | null;
}) {
  return functionItem.planperiod_start ?? functionItem.usageperiod_start ?? null;
}

function functionEnd(functionItem: {
  planperiod_end?: string | null;
  usageperiod_end?: string | null;
}) {
  return functionItem.planperiod_end ?? functionItem.usageperiod_end ?? null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function contactName(value?: { displayname?: string; name?: string } | null) {
  return value?.displayname || value?.name || '—';
}

function projectCity(project?: RentmanPlanningProject) {
  return project?.location?.visit_city ?? '';
}

function statusLabel(status: ShiftStatus) {
  if (status === 'critical') return 'Kritiek';
  if (status === 'filled') return 'Gevuld';
  return 'Open';
}

export default async function OpenShiftsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePlanningUser();
  const params = await searchParams;
  const today = dateKey();
  const from = validDate(valueOf(params.from), today);
  const to = validDate(valueOf(params.to), addDays(from, 7));
  const selectedFunction = valueOf(params.function) ?? 'all';
  const selectedProject = valueOf(params.project) ?? 'all';
  const requestedStatuses = valuesOf(params.status);
  const selectedStatuses = new Set<ShiftStatus>(
    (requestedStatuses.length ? requestedStatuses : ['open', 'critical'])
      .filter((status): status is ShiftStatus => ['open','critical','filled'].includes(status)),
  );

  const [planning, functions, assignments] = await Promise.all([
    getPlanningProjects(),
    getPlanningProjectFunctionsForRange(from, to),
    getPlanningCrewAssignmentsForRange(from, to),
  ]);

  const projectMap = new Map(planning.allProjects.map((project) => [project.id, project]));
  const assignmentsByFunction = new Map<number, number>();
  for (const assignment of assignments) {
    const functionId = assignment.function?.id;
    if (!functionId) continue;
    assignmentsByFunction.set(functionId, (assignmentsByFunction.get(functionId) ?? 0) + 1);
  }

  const rows = functions
    .filter((item) => item.type === 'crew_function')
    .map((item) => {
      const projectId = projectIdFromPath(item.project);
      const project = projectId ? projectMap.get(projectId) : undefined;
      const start = functionDate(item);
      const end = functionEnd(item);
      const needed = Math.max(0, Number(item.amount ?? 0));
      const planned = assignmentsByFunction.get(item.id) ?? 0;
      const open = Math.max(0, needed - planned);
      const status: ShiftStatus = open === 0 ? 'filled' : planned === 0 ? 'critical' : 'open';
      return {
        id: item.id,
        name: item.displayname || item.name || 'Shift',
        projectId,
        project,
        start,
        end,
        needed,
        planned,
        open,
        status,
      };
    })
    .filter((row) => row.project && row.start && row.end)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const functionsList = [...new Set(rows.map((row) => row.name))].sort((a, b) => a.localeCompare(b, 'nl'));
  const projectsList = [...new Map(rows.map((row) => [row.projectId, row.project])).entries()]
    .filter((entry): entry is [number, RentmanPlanningProject] => Boolean(entry[0] && entry[1]))
    .sort((a, b) => String(a[1].name).localeCompare(String(b[1].name), 'nl'));

  const filteredRows = rows.filter((row) => {
    if (!selectedStatuses.has(row.status)) return false;
    if (selectedFunction !== 'all' && row.name !== selectedFunction) return false;
    if (selectedProject !== 'all' && String(row.projectId) !== selectedProject) return false;
    return true;
  });

  const bartenderRows: BartenderExportRow[] = filteredRows
    .filter((row) => /bartender/i.test(row.name) && row.open > 0)
    .map((row) => ({
      projectNumber: String(row.project?.number ?? row.project?.id ?? ''),
      projectName: row.project?.name ?? '',
      dateLabel: formatDate(row.start as string),
      dateKey: String(row.start).slice(0, 10),
      timeLabel: `${formatTime(row.start as string)}–${formatTime(row.end as string)}`,
      location: contactName(row.project?.location),
      city: projectCity(row.project),
      open: row.open,
    }));

  const periodLabel = `${formatDate(`${from}T12:00:00+02:00`)} t/m ${formatDate(`${to}T12:00:00+02:00`)}`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Planning</span>
          <h1>Openstaande shifts</h1>
          <p>Snel inzicht in niet-ingevulde diensten voor de geselecteerde periode.</p>
        </div>
        <OpenShiftsExport rows={bartenderRows} periodLabel={periodLabel} />
      </header>

      <form className={styles.filters} method="get">
        <label>
          <span>Van</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          <span>Tot</span>
          <input type="date" name="to" defaultValue={to} />
        </label>

        <fieldset className={styles.statuses}>
          <legend>Status</legend>
          {(['open','critical','filled'] as ShiftStatus[]).map((status) => (
            <label key={status}>
              <input
                type="checkbox"
                name="status"
                value={status}
                defaultChecked={selectedStatuses.has(status)}
              />
              <span>{statusLabel(status)}</span>
            </label>
          ))}
        </fieldset>

        <label>
          <span>Functie</span>
          <select name="function" defaultValue={selectedFunction}>
            <option value="all">Alle functies</option>
            {functionsList.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>

        <label>
          <span>Project</span>
          <select name="project" defaultValue={selectedProject}>
            <option value="all">Alle projecten</option>
            {projectsList.map(([id, project]) => (
              <option key={id} value={id}>#{project.number ?? id} · {project.name}</option>
            ))}
          </select>
        </label>

        <button className="button orange" type="submit">Toepassen</button>
        <Link className="button secondary" href="/planning/open-shifts">Filters wissen</Link>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <strong>{filteredRows.length} shifts</strong>
            <span>Gevulde shifts zijn standaard verborgen.</span>
          </div>
          <span>{periodLabel}</span>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Functie</th>
                <th>Datum</th>
                <th>Tijd</th>
                <th>Nodig</th>
                <th>Gepland</th>
                <th>Open</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>#{row.project?.number ?? row.projectId} · {row.project?.name}</strong>
                    <small>{contactName(row.project?.location)}{projectCity(row.project) ? `, ${projectCity(row.project)}` : ''}</small>
                  </td>
                  <td>{row.name}</td>
                  <td>{formatDate(row.start as string)}</td>
                  <td>{formatTime(row.start as string)}–{formatTime(row.end as string)}</td>
                  <td>{row.needed}</td>
                  <td>{row.planned}</td>
                  <td className={row.open ? styles.openCount : undefined}>{row.open}</td>
                  <td><span className={`${styles.badge} ${styles[row.status]}`}>{statusLabel(row.status)}</span></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className={styles.empty}>Geen shifts gevonden binnen deze selectie.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.exportHint}>
        <div>
          <strong>Bartender-uitvraag</strong>
          <p>De knoppen bovenaan exporteren alleen zichtbare, open bartender-shifts met project, datum, tijd, locatie en aantal open plekken.</p>
        </div>
        <span>{bartenderRows.length} bartender-shifts in export</span>
      </section>
    </main>
  );
}
