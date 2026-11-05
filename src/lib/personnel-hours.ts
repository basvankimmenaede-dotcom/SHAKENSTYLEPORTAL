import { amsterdamDateKey } from '@/lib/closingChecklist';

const API_BASE = 'https://api.rentman.net';

export type StaffHourContract = {
  rentman_crew_id: number;
  weekly_hours: number;
  tracking_start_week: string;
  opening_balance_hours: number;
  is_active: boolean;
};

type RentmanList<T> = { data?: T[]; next_page_url?: string | null };

type Crew = {
  id: number;
  displayname?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  active?: boolean;
};

type TimeRegistration = {
  id: number;
  crewmember: string | null;
  start: string | null;
  duration: number | null;
  leavetype: string | null;
};

export type StaffHourRow = {
  crewId: number;
  name: string;
  weeklyHours: number;
  trackingStartWeek: string;
  openingBalanceHours: number;
  workedHours: number;
  creditedHours: number;
  leaveHours: number;
  previousWeekHours: number;
  contractDifference: number;
  previousWeekDifference: number;
  cumulativeBalance: number | null;
  overtimeWarning: boolean;
};

export function addDateDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function mondayOf(dateKey: string) {
  const day = new Date(dateKey + 'T12:00:00Z').getUTCDay();
  return addDateDays(dateKey, -(day === 0 ? 6 : day - 1));
}

export function isValidMonday(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + 'T12:00:00Z'))
    && new Date(value + 'T12:00:00Z').getUTCDay() === 1;
}

export function currentWeekMonday() {
  return mondayOf(amsterdamDateKey());
}

function amsterdamMidnight(dateKey: string) {
  const day = new Date(dateKey + 'T12:00:00Z');
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    timeZoneName: 'shortOffset',
  }).formatToParts(day).find((p) => p.type === 'timeZoneName')?.value || 'GMT+1';
  const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offset = match
    ? match[1] + match[2].padStart(2, '0') + ':' + (match[3] || '00')
    : '+01:00';
  return dateKey + 'T00:00:00' + offset;
}

async function rentmanList<T>(path: string): Promise<T[]> {
  const token = process.env.RENTMAN_API_TOKEN;
  if (!token) throw new Error('Rentman API is niet geconfigureerd.');

  const values: T[] = [];
  let next: string | null = API_BASE + path;
  let page = 0;
  while (next) {
    const url: URL = new URL(next, API_BASE);
    if (url.origin !== API_BASE) throw new Error('Ongeldige Rentman-vervolgpagina.');
    const response = await fetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      next: { revalidate: 60 },
    });
    if (!response.ok) throw new Error('Rentman tijdregistratie niet bereikbaar (' + response.status + ').');
    const body = (await response.json()) as RentmanList<T>;
    values.push(...(body.data ?? []));
    next = body.next_page_url ?? null;
    if (++page > 100) throw new Error('Te veel tijdregistraties om te laden.');
  }
  return values;
}

export async function getRentmanStaff() {
  const crew = await rentmanList<Crew>('/crew?fields=id,displayname,firstname,lastname,active&limit=1500');
  return crew.map((person) => ({
    id: person.id,
    name: person.displayname
      || [person.firstname, person.lastname].filter(Boolean).join(' ')
      || 'Medewerker #' + person.id,
    active: person.active !== false,
  })).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

async function getRentmanRegistrations(startWeek: string, endWeekExclusive: string) {
  const query = new URLSearchParams({
    fields: 'id,crewmember,start,duration,leavetype',
    sort: '+start',
    limit: '1500',
  });
  query.set('start[gte]', amsterdamMidnight(startWeek));
  query.set('start[lt]', amsterdamMidnight(endWeekExclusive));
  return rentmanList<TimeRegistration>('/timeregistration?' + query.toString());
}

function hours(seconds: number) {
  return Math.round((seconds / 3600) * 100) / 100;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export async function buildStaffHourOverview(
  week: string,
  contracts: StaffHourContract[],
) {
  const currentWeek = currentWeekMonday();
  const isCurrentWeek = week === currentWeek;
  const previousWeek = addDateDays(week, -7);
  const active = contracts.filter((c) => c.is_active);
  const crew = await getRentmanStaff();
  const names = new Map(crew.map((person) => [person.id, person.name]));

  if (!active.length) {
    return {
      week, currentWeek, isCurrentWeek, rows: [] as StaffHourRow[],
      summary: { workedHours: 0, creditedHours: 0, contractDifference: 0, previousWeekDifference: 0, warnings: 0 },
      crew: crew.filter((person) => person.active),
    };
  }

  const trackedIds = new Set(active.map((c) => Number(c.rentman_crew_id)));
  const firstWeek = [previousWeek, ...active.map((c) => c.tracking_start_week)]
    .sort()[0];
  const registrations = await getRentmanRegistrations(firstWeek, addDateDays(week, 7));
  const totals = new Map<string, { worked: number; credit: number; leave: number }>();

  for (const registration of registrations) {
    const crewId = Number(registration.crewmember?.split('/').pop());
    if (!trackedIds.has(crewId) || !registration.start) continue;
    const dateKey = registration.start.slice(0, 10);
    const registrationWeek = mondayOf(dateKey);
    const kind = Number(registration.leavetype?.split('/').pop());
    const seconds = Number(registration.duration ?? 0);
    if (!Number.isFinite(seconds) || ![1, 2, 3, 4].includes(kind)) continue;

    const key = crewId + ':' + registrationWeek;
    const value = totals.get(key) ?? { worked: 0, credit: 0, leave: 0 };
    if (kind === 1) value.worked += seconds;
    value.credit += seconds;
    if (kind === 2 || kind === 4) value.leave += seconds;
    totals.set(key, value);
  }

  const rows: StaffHourRow[] = active.map((contract) => {
    const crewId = Number(contract.rentman_crew_id);
    const weeklyHours = Number(contract.weekly_hours);
    const current = totals.get(crewId + ':' + week) ?? { worked: 0, credit: 0, leave: 0 };
    const previous = totals.get(crewId + ':' + previousWeek) ?? { worked: 0, credit: 0, leave: 0 };
    const workedHours = hours(current.worked);
    const creditedHours = hours(current.credit);
    const previousWeekHours = hours(previous.worked);
    const trackingStarted = contract.tracking_start_week <= week;
    const contractDifference = trackingStarted ? rounded(creditedHours - weeklyHours) : 0;

    // A current week is incomplete: keep its provisional deficit out of the saved balance.
    const lastClosedWeek = isCurrentWeek ? previousWeek : week;
    let cumulativeBalance: number | null = trackingStarted
      ? Number(contract.opening_balance_hours || 0)
      : null;
    if (cumulativeBalance !== null) {
      for (let day = contract.tracking_start_week; day <= lastClosedWeek; day = addDateDays(day, 7)) {
        const count = totals.get(crewId + ':' + day);
        cumulativeBalance += hours(count?.credit ?? 0) - weeklyHours;
      }
      cumulativeBalance = rounded(cumulativeBalance);
    }

    return {
      crewId, name: names.get(crewId) ?? 'Medewerker #' + crewId,
      weeklyHours, trackingStartWeek: contract.tracking_start_week,
      openingBalanceHours: Number(contract.opening_balance_hours || 0),
      workedHours, creditedHours, leaveHours: hours(current.leave),
      previousWeekHours,
      contractDifference,
      previousWeekDifference: rounded(workedHours - previousWeekHours),
      cumulativeBalance,
      overtimeWarning: trackingStarted && contractDifference > 5,
    };
  }).sort((a, b) => b.contractDifference - a.contractDifference || a.name.localeCompare(b.name, 'nl'));

  const sum = (field: 'workedHours' | 'creditedHours' | 'contractDifference' | 'previousWeekDifference') =>
    rounded(rows.reduce((total, row) => total + row[field], 0));

  return {
    week, currentWeek, isCurrentWeek, rows,
    summary: {
      workedHours: sum('workedHours'),
      creditedHours: sum('creditedHours'),
      contractDifference: sum('contractDifference'),
      previousWeekDifference: sum('previousWeekDifference'),
      warnings: rows.filter((row) => row.overtimeWarning).length,
    },
    crew: crew.filter((person) => person.active),
  };
}
