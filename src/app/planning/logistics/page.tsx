import LogisticsOptimizer, {
  type LogisticsDayStatus,
  type LogisticsOwner,
  type LogisticsStop,
  type LogisticsSuggestion,
} from '@/components/LogisticsOptimizer';
import { requirePlanningUser } from '@/lib/auth';
import {
  getPlanningCrewAssignmentsForRange,
  getPlanningProjectVehicles,
  getPlanningProjects,
  getPlanningVehicles,
  type RentmanPlanningCrewAssignment,
  type RentmanPlanningProject,
  type RentmanPlanningProjectVehicle,
} from '@/lib/rentman';

type SearchParams = Record<string, string | string[] | undefined>;
type ViewMode = 'vehicle' | 'person';

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function projectAddress(project?: RentmanPlanningProject) {
  const location = project?.location;
  if (!location) return '';
  return [
    [location.visit_street, location.visit_number].filter(Boolean).join(' '),
    [location.visit_postalcode, location.visit_city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
}

function displayName(value?: { displayname?: string; name?: string } | null) {
  return value?.displayname || value?.name || '';
}

function vehicleStart(item: RentmanPlanningProjectVehicle) {
  return item.function?.planperiod_start ?? item.function?.usageperiod_start ?? null;
}

function vehicleEnd(item: RentmanPlanningProjectVehicle) {
  return item.function?.planperiod_end ?? item.function?.usageperiod_end ?? vehicleStart(item);
}

function crewStart(item: RentmanPlanningCrewAssignment) {
  return item.function?.planperiod_start ?? item.function?.usageperiod_start ?? null;
}

function crewEnd(item: RentmanPlanningCrewAssignment) {
  return item.function?.planperiod_end ?? item.function?.usageperiod_end ?? crewStart(item);
}

function overlapsDay(start: string | null, end: string | null, day: string) {
  const startDay = start?.slice(0, 10);
  const endDay = end?.slice(0, 10) ?? startDay;
  return Boolean(startDay && endDay && startDay <= day && endDay >= day);
}

function vehicleGroupName(item: RentmanPlanningProjectVehicle) {
  const group = item.function?.group;
  if (!group || typeof group === 'string') return '—';
  return group.displayname || group.name || '—';
}

function crewGroupName(item: RentmanPlanningCrewAssignment) {
  return item.function?.group?.displayname || item.function?.group?.name || '—';
}

function normalizedCity(city: string) {
  return city.trim().toLowerCase();
}

function stopFromProject({
  id,
  project,
  projectId,
  ownerId,
  ownerName,
  ownerMeta,
  functionName,
  groupName,
  start,
  end,
}: {
  id: number;
  project: RentmanPlanningProject;
  projectId: number;
  ownerId: number;
  ownerName: string;
  ownerMeta: string;
  functionName: string;
  groupName: string;
  start: string | null;
  end: string | null;
}): LogisticsStop {
  return {
    id,
    projectId,
    projectNumber: String(project.number ?? project.id),
    projectName: project.name,
    ownerId,
    ownerName,
    ownerMeta,
    functionName,
    groupName,
    start,
    end,
    locationName: displayName(project.location) || 'Onbekende locatie',
    address: projectAddress(project),
    city: project.location?.visit_city ?? '',
    warehouseDistanceKm: typeof project.location?.distance === 'number' ? project.location.distance : null,
  };
}

function buildVehicleStops(
  assignments: RentmanPlanningProjectVehicle[],
  projectMap: Map<number, RentmanPlanningProject>,
  day: string,
): LogisticsStop[] {
  const stops: LogisticsStop[] = [];
  const seen = new Set<string>();

  for (const assignment of assignments) {
    const start = vehicleStart(assignment);
    const end = vehicleEnd(assignment);
    if (!overlapsDay(start, end, day)) continue;

    const ownerId = assignment.vehicle?.id;
    const projectId = projectIdFromPath(assignment.function?.project);
    if (!ownerId || !projectId) continue;
    const project = projectMap.get(projectId);
    if (!project) continue;

    const key = [ownerId, projectId, assignment.function?.id ?? assignment.id, start ?? ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    stops.push(stopFromProject({
      id: assignment.function?.id ?? assignment.id,
      project,
      projectId,
      ownerId,
      ownerName: displayName(assignment.vehicle) || `Voertuig ${ownerId}`,
      ownerMeta: assignment.vehicle?.licenseplate ?? '',
      functionName: assignment.function?.displayname || assignment.function?.name || 'Logistiek',
      groupName: vehicleGroupName(assignment),
      start,
      end,
    }));
  }

  return stops.sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
}

function buildCrewStops(
  assignments: RentmanPlanningCrewAssignment[],
  projectMap: Map<number, RentmanPlanningProject>,
  day: string,
): LogisticsStop[] {
  const stops: LogisticsStop[] = [];
  const seen = new Set<string>();

  for (const assignment of assignments) {
    const start = crewStart(assignment);
    const end = crewEnd(assignment);
    if (!overlapsDay(start, end, day)) continue;

    const ownerId = assignment.crewmember?.id;
    const projectId = projectIdFromPath(assignment.function?.project);
    if (!ownerId || !projectId) continue;
    const project = projectMap.get(projectId);
    if (!project) continue;

    const crewName = assignment.crewmember?.displayname
      || [assignment.crewmember?.firstname, assignment.crewmember?.middle_name, assignment.crewmember?.lastname].filter(Boolean).join(' ')
      || `Persoon ${ownerId}`;
    const key = [ownerId, projectId, assignment.function?.id ?? assignment.id, start ?? ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    stops.push(stopFromProject({
      id: assignment.function?.id ?? assignment.id,
      project,
      projectId,
      ownerId,
      ownerName: crewName,
      ownerMeta: 'Personeel',
      functionName: assignment.function?.displayname || assignment.function?.name || 'Planning',
      groupName: crewGroupName(assignment),
      start,
      end,
    }));
  }

  return stops.sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
}

function ownersFromStops(
  stops: LogisticsStop[],
  catalog: Array<{ id: number; name: string; meta: string }> = [],
  fuelCardThresholdKm = 150,
): LogisticsOwner[] {
  const byOwner = new Map<number, LogisticsStop[]>();
  for (const stop of stops) {
    const current = byOwner.get(stop.ownerId) ?? [];
    current.push(stop);
    byOwner.set(stop.ownerId, current);
  }

  const ownerMap = new Map<number, LogisticsOwner>();
  for (const item of catalog) {
    ownerMap.set(item.id, {
      id: item.id,
      name: item.name,
      subtitle: item.meta,
      stops: [],
      referenceDistanceKm: 0,
      fuelCardRequired: false,
    });
  }

  for (const [ownerId, ownerStops] of byOwner) {
    const current = ownerMap.get(ownerId);
    const referenceDistanceKm = ownerStops.reduce(
      (sum, stop) => sum + (stop.warehouseDistanceKm !== null ? stop.warehouseDistanceKm * 2 : 0),
      0,
    );
    const fuelCardRequired = ownerStops.some(
      (stop) => stop.warehouseDistanceKm !== null && stop.warehouseDistanceKm * 2 > fuelCardThresholdKm,
    );
    ownerMap.set(ownerId, {
      id: ownerId,
      name: current?.name || ownerStops[0]?.ownerName || `Route ${ownerId}`,
      subtitle: current?.subtitle || ownerStops[0]?.ownerMeta || '',
      stops: ownerStops,
      referenceDistanceKm,
      fuelCardRequired,
    });
  }

  return [...ownerMap.values()].sort((a, b) => {
    if (a.stops.length && !b.stops.length) return -1;
    if (!a.stops.length && b.stops.length) return 1;
    return a.name.localeCompare(b.name, 'nl');
  });
}

function buildSuggestions(
  owners: LogisticsOwner[],
  tomorrowStops: LogisticsStop[],
  fuelCardThresholdKm: number,
  viewMode: ViewMode,
): LogisticsSuggestion[] {
  const suggestions: LogisticsSuggestion[] = [];
  const activeOwners = owners.filter((owner) => owner.stops.length > 0);

  if (viewMode === 'vehicle') {
    const ownersById = new Map(activeOwners.map((owner) => [owner.id, owner]));
    const cityOwners = new Map<string, Set<number>>();
    const cityStops = new Map<string, LogisticsStop[]>();

    for (const owner of activeOwners) {
      for (const stop of owner.stops) {
        const city = normalizedCity(stop.city);
        if (!city) continue;
        const ids = cityOwners.get(city) ?? new Set<number>();
        ids.add(owner.id);
        cityOwners.set(city, ids);
        const cityList = cityStops.get(city) ?? [];
        cityList.push(stop);
        cityStops.set(city, cityList);
      }
    }

    for (const [city, ids] of cityOwners) {
      if (ids.size < 2) continue;
      const cityStopList = cityStops.get(city) ?? [];
      const sourceCandidate = cityStopList
        .map((stop) => ({ stop, route: ownersById.get(stop.ownerId) }))
        .filter((item): item is { stop: LogisticsStop; route: LogisticsOwner } => Boolean(item.route))
        .find((item) => item.route.stops.length === 1 && !/eigen vervoer/i.test(item.route.name));

      if (sourceCandidate) {
        const targetStop = cityStopList.find((stop) => {
          if (stop.ownerId === sourceCandidate.stop.ownerId) return false;
          const target = ownersById.get(stop.ownerId);
          return Boolean(target && !/eigen vervoer/i.test(target.name));
        });
        const targetOwner = targetStop ? ownersById.get(targetStop.ownerId) : null;
        if (targetOwner) {
          const stop = sourceCandidate.stop;
          suggestions.push({
            id: `transfer-${stop.id}-${targetOwner.id}`,
            type: 'vehicle-transfer',
            badge: 'Voertuigwissel',
            title: `Bekijk #${stop.projectNumber} op ${targetOwner.name}`,
            description: `${sourceCandidate.route.name} heeft alleen deze stop in ${stop.city}. ${targetOwner.name} komt daar ook. Dit is een duidelijke kandidaat om handmatig te vergelijken.`,
            approvable: true,
            checks: [
              'Controleer tijdvenster en laadruimte.',
              'Portal wijzigt Rentman niet automatisch.',
            ],
            actionLines: [
              `Project #${stop.projectNumber} · ${stop.projectName}`,
              `Vergelijk voertuig ${sourceCandidate.route.name} met ${targetOwner.name}`,
              `Functie: ${stop.groupName !== '—' ? `${stop.groupName} · ` : ''}${stop.functionName}`,
              `Locatie: ${stop.locationName}${stop.city ? ` · ${stop.city}` : ''}`,
              'Pas de gekozen wijziging handmatig aan in Rentman',
            ],
          });
        }
      } else {
        const names = [...ids].map((id) => ownersById.get(id)?.name).filter(Boolean).join(' en ');
        suggestions.push({
          id: `city-${city}`,
          type: 'info',
          badge: 'Dubbele plaats',
          title: `Meerdere voertuigen in ${cityStopList[0]?.city || city}`,
          description: `${names} hebben dezelfde dag een stop in dezelfde plaats. Met Google Routes kunnen we straks exact bepalen of samenvoegen echt sneller is.`,
          approvable: false,
          checks: [],
          actionLines: [],
        });
      }
    }

    const todayCities = new Map<string, string[]>();
    for (const owner of activeOwners) {
      for (const stop of owner.stops) {
        const city = normalizedCity(stop.city);
        if (!city) continue;
        const current = todayCities.get(city) ?? [];
        if (!current.includes(owner.name)) current.push(owner.name);
        todayCities.set(city, current);
      }
    }

    const tomorrowSeen = new Set<number>();
    for (const stop of tomorrowStops) {
      if (tomorrowSeen.has(stop.projectId)) continue;
      const city = normalizedCity(stop.city);
      const todayOwners = todayCities.get(city);
      if (!city || !todayOwners?.length) continue;
      tomorrowSeen.add(stop.projectId);
      suggestions.push({
        id: `tomorrow-${stop.projectId}`,
        type: 'tomorrow-nearby',
        badge: 'Morgen in de buurt',
        title: `#${stop.projectNumber} ligt op een route van vandaag`,
        description: `${stop.projectName} staat morgen in ${stop.city}. Vandaag komt ${todayOwners.join(', ')} daar al.`,
        approvable: false,
        checks: [
          'Alleen eerder meenemen als de locatie kan ontvangen.',
          'Controleer materiaalbeschikbaarheid en opslag.',
        ],
        actionLines: [],
      });
    }
  }

  for (const owner of activeOwners) {
    if (!owner.fuelCardRequired) continue;
    suggestions.push({
      id: `fuel-${viewMode}-${owner.id}`,
      type: 'fuel-card',
      badge: 'Brandstofpas',
      title: `Brandstofpas controleren voor ${owner.name}`,
      description: `Minimaal één geplande stop komt op meer dan ${fuelCardThresholdKm} km retour vanaf het magazijn volgens de Rentman-afstand.`,
      approvable: true,
      checks: ['Na een route- of voertuigwijziging opnieuw controleren.'],
      actionLines: [
        `Controleer brandstofpas voor ${owner.name}`,
        owner.subtitle ? `Referentie: ${owner.subtitle}` : 'Geen extra referentie beschikbaar',
        `Drempel in portal: ${fuelCardThresholdKm} km retour`,
      ],
    });
  }

  return suggestions.slice(0, 12);
}

function analyseDay(stops: LogisticsStop[], fuelCardThresholdKm: number): LogisticsDayStatus['status'] {
  if (!stops.length) return 'empty';

  const byOwner = new Map<number, LogisticsStop[]>();
  const cityOwners = new Map<string, Set<number>>();
  for (const stop of stops) {
    const ownerStops = byOwner.get(stop.ownerId) ?? [];
    ownerStops.push(stop);
    byOwner.set(stop.ownerId, ownerStops);
    const city = normalizedCity(stop.city);
    if (city) {
      const ids = cityOwners.get(city) ?? new Set<number>();
      ids.add(stop.ownerId);
      cityOwners.set(city, ids);
    }
  }

  const duplicatedCity = [...cityOwners.values()].some((ids) => ids.size > 1);
  const activeOwners = [...byOwner.values()];
  const obviousSingleStop = activeOwners.length > 1 && activeOwners.some((items) => items.length === 1);
  const longRoute = stops.some((stop) => stop.warehouseDistanceKm !== null && stop.warehouseDistanceKm * 2 > fuelCardThresholdKm);

  if (duplicatedCity && obviousSingleStop) return 'red';
  if (duplicatedCity || obviousSingleStop || longRoute) return 'yellow';
  return 'green';
}

function dayLabel(day: string, today: string) {
  if (day === today) return 'Vandaag';
  return new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short' })
    .format(new Date(`${day}T12:00:00+02:00`))
    .replace('.', '');
}

export default async function LogisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase } = await requirePlanningUser();
  const params = await searchParams;
  const today = dateKey();
  const weekEnd = addDays(today, 6);
  const selectedDate = validDate(valueOf(params.date), today);
  const viewMode: ViewMode = valueOf(params.view) === 'person' ? 'person' : 'vehicle';
  const tomorrow = addDays(selectedDate, 1);

  const [planning, projectVehicles, vehiclesCatalog, crewAssignments, settingsResult] = await Promise.all([
    getPlanningProjects(),
    getPlanningProjectVehicles(),
    getPlanningVehicles(),
    getPlanningCrewAssignmentsForRange(today, addDays(weekEnd, 1)),
    supabase
      .from('planning_settings')
      .select('fuel_card_distance_km')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const fuelCardThresholdKm = Number(settingsResult.data?.fuel_card_distance_km ?? 150);
  const projectMap = new Map(planning.allProjects.map((project) => [project.id, project]));

  const vehicleStops = buildVehicleStops(projectVehicles, projectMap, selectedDate);
  const crewStops = buildCrewStops(crewAssignments, projectMap, selectedDate);
  const tomorrowVehicleStops = buildVehicleStops(projectVehicles, projectMap, tomorrow);

  const vehicleCatalog = vehiclesCatalog.map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.displayname || vehicle.name || `Voertuig ${vehicle.id}`,
    meta: vehicle.licenseplate ?? '',
  }));

  const peopleCatalog = [...new Map(
    crewAssignments
      .filter((assignment) => assignment.crewmember?.id)
      .map((assignment) => {
        const member = assignment.crewmember!;
        const name = member.displayname
          || [member.firstname, member.middle_name, member.lastname].filter(Boolean).join(' ')
          || `Persoon ${member.id}`;
        return [member.id, { id: member.id, name, meta: 'Personeel' }] as const;
      }),
  ).values()];

  const owners = viewMode === 'vehicle'
    ? ownersFromStops(vehicleStops, vehicleCatalog, fuelCardThresholdKm)
    : ownersFromStops(crewStops, peopleCatalog, fuelCardThresholdKm);

  const suggestions = buildSuggestions(
    owners,
    tomorrowVehicleStops,
    fuelCardThresholdKm,
    viewMode,
  );

  const days: LogisticsDayStatus[] = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index);
    const stops = buildVehicleStops(projectVehicles, projectMap, day);
    const status = analyseDay(stops, fuelCardThresholdKm);
    const activeOwners = new Set(stops.map((stop) => stop.ownerId)).size;
    return {
      date: day,
      label: dayLabel(day, today),
      dateLabel: new Intl.DateTimeFormat('nl-NL', {
        timeZone: 'Europe/Amsterdam',
        day: '2-digit',
        month: '2-digit',
      }).format(new Date(`${day}T12:00:00+02:00`)),
      status,
      summary: status === 'empty'
        ? 'Geen ritten'
        : `${activeOwners} voertuig${activeOwners === 1 ? '' : 'en'} · ${stops.length} stop${stops.length === 1 ? '' : 's'}`,
    };
  });

  return (
    <LogisticsOptimizer
      selectedDate={selectedDate}
      viewMode={viewMode}
      owners={owners}
      suggestions={suggestions}
      fuelCardThresholdKm={fuelCardThresholdKm}
      days={days}
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
      logisticsBaseAddress={process.env.NEXT_PUBLIC_LOGISTICS_BASE_ADDRESS || 'SHAKENSTYLE, Boesingheliede, Netherlands'}
    />
  );
}
