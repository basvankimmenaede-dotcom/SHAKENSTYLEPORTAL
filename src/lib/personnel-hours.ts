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
  previousWeekDifference: number | null;
  cumulativeBalance: number | null;
  // A provisional week forecast, based only on logged working days.
  expectedWorkdays: number;
  averageDailyHours: number | null;
  sampleWorkdays: number;
  remainingEstimatedDays: number;
  forecastHours: number | null;
  forecastDifference: number | null;
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

// Most team members work an eight-hour day: 32h = 4 days, 40h = 5 days.
// We do not infer shifts from Rentman, as not every shift is planned there.
export function contractedWorkdays(weeklyHours: number) {
  return Math.min(5, Math.max(1, Math.ceil(weeklyHours / 8)));
}

export function forecastHoursFromAverage({
  registeredHours,
  weeklyHours,
  averageDailyHours,
  accountedDays,
  availableDays,
}: {
  registeredHours: number;
  weeklyHours: number;
  averageDailyHours: number | null;
  accountedDays: number;
  availableDays: number;
}) {
  const remainingDays = Math.min(
    Math.max(0, contractedWorkdays(weeklyHours) - accountedDays),
    Math.max(0, availableDays),
  );
  if (averageDailyHours === null || !Number.isFinite(averageDailyHours)) {
    return { remainingDays, forecastHours: null, forecastDifference: null };
  }
  const forecastHours = rounded(registeredHours + averageDailyHours * remainingDays);
  return {
    remainingDays,
    forecastHours,
    forecastDifference: rounded(forecastHours - weeklyHours),
  };
}

export async function buildStaffHourOverview(
  week: string,
  contracts: StaffHourContract[],
) {
  const currentWeek = currentWeekMonday();
  const isCurrentWeek = week === currentWeek;
  const today = amsterdamDateKey();
  const previousWeek = addDateDays(week, -7);
  const active = contracts.filter((c) => c.is_active);
  const crew = await getRentmanStaff();
  const names = new Map(crew.map((person) => [person.id, person.name]));

  if (!active.length) {
    return {
      week, currentWeek, isCurrentWeek, rows: [] as StaffHourRow[],
      summary: { workedHours: 0, creditedHours: 0, contractDifference: 0,
        previousWeekDifference: 0, forecastHours: null as number | null,
        forecastDifference: null as number | null, forecastCoveredCount: 0, warnings: 0 },
      crew: crew.filter((person) => person.active),
    };
  }

  const trackedIds = new Set(active.map((c) => Number(c.rentman_crew_id)));
  const firstWeek = [
    previousWeek, ...active.map((c) => c.tracking_start_week),
    ...(isCurrentWeek ? [addDateDays(week, -35)] : []),
  ].sort()[0];
  const registrations = await getRentmanRegistrations(firstWeek, addDateDays(week, 7));
  const totals = new Map<string, { worked: number; credit: number; leave: number }>();
  const daily = new Map<number, Map<string, { worked: number; leave: number }>>();

  for (const registration of registrations) {
    const crewId = Number(registration.crewmember?.split('/').pop());
    if (!trackedIds.has(crewId) || !registration.start) continue;
    const dateKey = registration.start.slice(0, 10);
    // Future-dated registrations are not yet worked hours.
    if (isCurrentWeek && dateKey > today) continue;
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

    if (seconds > 0 && (kind === 1 || kind === 2 || kind === 4)) {
      const days = daily.get(crewId) ?? new Map<string, { worked: number; leave: number }>();
      const day = days.get(dateKey) ?? { worked: 0, leave: 0 };
      if (kind === 1) day.worked += seconds;
      if (kind === 2 || kind === 4) day.leave += seconds;
      days.set(dateKey, day);
      daily.set(crewId, days);
    }
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

    // Use up to ten recently completed working days (max five weeks back).
    // Today's hours are included in the actual total, but not in the average:
    // the employee may still be in the middle of their shift.
    const days = daily.get(crewId) ?? new Map<string, { worked: number; leave: number }>();
    const sample = isCurrentWeek ? Array.from(days.entries())
      .filter(([date, value]) => date < today
        && date >= addDateDays(today, -35) && value.worked > 0)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 10) : [];
    const averageDailyHours = sample.length
      ? rounded(sample.reduce((total, [, day]) => total + day.worked, 0) / 3600 / sample.length)
      : null;

    const thisWeekDays = Array.from(days.entries())
      .filter(([date]) => date >= week && date <= addDateDays(week, 6) && date <= today);
    // Sick days / holiday days count towards the week. A partial leave day
    // consumes only the applicable fraction of a standard eight-hour day.
    const accountedDays = thisWeekDays.reduce((total, [, day]) => {
      if (day.worked > 0) return total + 1;
      return total + Math.min(1, day.leave / (8 * 3600));
    }, 0);
    let remainingWeekdays = 0;
    if (isCurrentWeek) {
      for (let date = today; date <= addDateDays(week, 6); date = addDateDays(date, 1)) {
        const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
        if (weekday >= 1 && weekday <= 5 && !days.has(date)) remainingWeekdays++;
      }
    }
    const estimate = forecastHoursFromAverage({
      registeredHours: creditedHours,
      weeklyHours,
      averageDailyHours: isCurrentWeek && trackingStarted ? averageDailyHours : null,
      accountedDays,
      availableDays: remainingWeekdays,
    });

    const forecastWorkedHours = isCurrentWeek && estimate.forecastHours !== null
      ? rounded(workedHours + (averageDailyHours ?? 0) * estimate.remainingDays)
      : null;

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
      previousWeekDifference: isCurrentWeek
        ? forecastWorkedHours === null ? null : rounded(forecastWorkedHours - previousWeekHours)
        : rounded(workedHours - previousWeekHours),
      cumulativeBalance,
      expectedWorkdays: contractedWorkdays(weeklyHours),
      averageDailyHours,
      sampleWorkdays: sample.length,
      remainingEstimatedDays: estimate.remainingDays,
      forecastHours: isCurrentWeek ? estimate.forecastHours : null,
      forecastDifference: isCurrentWeek ? estimate.forecastDifference : null,
      overtimeWarning: trackingStarted && (
        isCurrentWeek && estimate.forecastDifference !== null
          ? estimate.forecastDifference > 5
          : rounded(workedHours - weeklyHours) > 5
      ),
    };
  }).sort((a, b) => b.contractDifference - a.contractDifference || a.name.localeCompare(b.name, 'nl'));

  const sum = (field: 'workedHours' | 'creditedHours' | 'contractDifference') =>
    rounded(rows.reduce((total, row) => total + row[field], 0));
  const forecastable = rows.filter((row) => row.forecastHours !== null);
  const forecastComplete = isCurrentWeek && forecastable.length === rows.length;
  const forecastSum = (field: 'forecastHours' | 'forecastDifference') =>
    rounded(forecastable.reduce((total, row) => total + (row[field] ?? 0), 0));

  return {
    week, currentWeek, isCurrentWeek, rows,
    summary: {
      workedHours: sum('workedHours'),
      creditedHours: sum('creditedHours'),
      contractDifference: sum('contractDifference'),
      previousWeekDifference: !isCurrentWeek || rows.every((row) => row.previousWeekDifference !== null)
        ? rounded(rows.reduce((total, row) => total + (row.previousWeekDifference ?? 0), 0))
        : null,
      forecastHours: forecastComplete ? forecastSum('forecastHours') : null,
      forecastDifference: forecastComplete ? forecastSum('forecastDifference') : null,
      forecastCoveredCount: forecastable.length,
      warnings: rows.filter((row) => row.overtimeWarning).length,
    },
    crew: crew.filter((person) => person.active),
  };
}
