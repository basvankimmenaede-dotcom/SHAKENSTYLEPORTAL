import LogisticsOptimizer, {
  type LogisticsStop,
  type LogisticsSuggestion,
  type LogisticsVehicle,
} from '@/components/LogisticsOptimizer';
import { requirePlanningUser } from '@/lib/auth';
import {
  getPlanningProjectPeriod,
  getPlanningProjects,
  getPlanningProjectVehicles,
  getPlanningVehicles,
  type RentmanPlanningProject,
  type RentmanPlanningProjectVehicle,
} from '@/lib/rentman';

type SearchParams = Record<string, string | string[] | undefined>;

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

function functionStart(item: RentmanPlanningProjectVehicle) {
  return item.function?.planperiod_start ?? item.function?.usageperiod_start ?? null;
}

function functionEnd(item: RentmanPlanningProjectVehicle) {
  return item.function?.planperiod_end ?? item.function?.usageperiod_end ?? functionStart(item);
}

function overlapsDay(item: RentmanPlanningProjectVehicle, day: string) {
  const start = functionStart(item)?.slice(0, 10);
  const end = functionEnd(item)?.slice(0, 10) ?? start;
  return Boolean(start && end && start <= day && end >= day);
}

function displayName(value?: { displayname?: string; name?: string } | null) {
  return value?.displayname || value?.name || '';
}

function projectAddress(project?: RentmanPlanningProject) {
  const location = project?.location;
  if (!location) return '';
  return [
    [location.visit_street, location.visit_number].filter(Boolean).join(' '),
    [location.visit_postalcode, location.visit_city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
}

function normalizedCity(city: string) {
  return city.trim().toLowerCase();
}

function groupName(item: RentmanPlanningProjectVehicle) {
  const group = item.function?.group;
  if (!group || typeof group === 'string') return '—';
  return group.displayname || group.name || '—';
}

function buildStops(
  assignments: RentmanPlanningProjectVehicle[],
  projectMap: Map<number, RentmanPlanningProject>,
): LogisticsStop[] {
  const seen = new Set<string>();
  const stops: LogisticsStop[] = [];

  for (const assignment of assignments) {
    const vehicleId = assignment.vehicle?.id;
    const projectId = projectIdFromPath(assignment.function?.project);
    if (!vehicleId || !projectId) continue;
    const project = projectMap.get(projectId);
    if (!project) continue;

    const start = functionStart(assignment);
    const end = functionEnd(assignment);
    const key = [vehicleId, projectId, assignment.function?.id ?? assignment.id, start ?? ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    stops.push({
      id: assignment.function?.id ?? assignment.id,
      projectId,
      projectNumber: String(project.number ?? project.id),
      projectName: project.name,
      vehicleId,
      vehicleName: displayName(assignment.vehicle) || `Voertuig ${vehicleId}`,
      licensePlate: assignment.vehicle?.licenseplate ?? '',
      functionName: assignment.function?.displayname || assignment.function?.name || 'Logistiek',
      groupName: groupName(assignment),
      start,
      end,
      locationName: displayName(project.location) || 'Onbekende locatie',
      address: projectAddress(project),
      city: project.location?.visit_city ?? '',
      warehouseDistanceKm: typeof project.location?.distance === 'number' ? project.location.distance : null,
    });
  }

  return stops.sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
}

function buildSuggestions(
  vehicles: LogisticsVehicle[],
  tomorrowStops: LogisticsStop[],
  fuelCardThresholdKm: number,
): LogisticsSuggestion[] {
  const suggestions: LogisticsSuggestion[] = [];
  const activeVehicles = vehicles.filter((vehicle) => vehicle.stops.length > 0);
  const vehiclesById = new Map(activeVehicles.map((vehicle) => [vehicle.id, vehicle]));

  const cityVehicles = new Map<string, Set<number>>();
  const cityStops = new Map<string, LogisticsStop[]>();

  for (const vehicle of activeVehicles) {
    for (const stop of vehicle.stops) {
      const city = normalizedCity(stop.city);
      if (!city) continue;
      const ids = cityVehicles.get(city) ?? new Set<number>();
      ids.add(vehicle.id);
      cityVehicles.set(city, ids);
      const stops = cityStops.get(city) ?? [];
      stops.push(stop);
      cityStops.set(city, stops);
    }
  }

  for (const [city, ids] of cityVehicles) {
    if (ids.size < 2) continue;
    const cityStopList = cityStops.get(city) ?? [];
    const sourceCandidate = cityStopList
      .map((stop) => ({ stop, route: vehiclesById.get(stop.vehicleId) }))
      .filter((item): item is { stop: LogisticsStop; route: LogisticsVehicle } => Boolean(item.route))
      .find((item) => item.route.stops.length === 1);

    if (sourceCandidate) {
      const targetStop = cityStopList.find((stop) => stop.vehicleId !== sourceCandidate.stop.vehicleId);
      const targetVehicle = targetStop ? vehiclesById.get(targetStop.vehicleId) : null;
      if (targetVehicle) {
        const stop = sourceCandidate.stop;
        suggestions.push({
          id: `transfer-${stop.id}-${targetVehicle.id}`,
          type: 'vehicle-transfer',
          badge: 'Voertuigwissel',
          title: `Bekijk #${stop.projectNumber} op ${targetVehicle.name}`,
          description: `${sourceCandidate.route.name} heeft op deze dag alleen deze geplande stop in ${stop.city}. ${targetVehicle.name} komt ook in dezelfde plaats. Dit is een sterke kandidaat om handmatig te combineren.`,
          approvable: true,
          checks: [
            'Controleer tijdvenster en laadruimte voor je dit doorvoert.',
            'Portal wijzigt de voertuigplanning niet automatisch.',
          ],
          actionLines: [
            `Project #${stop.projectNumber} · ${stop.projectName}`,
            `Wijzig gepland voertuig van ${sourceCandidate.route.name} naar ${targetVehicle.name}`,
            `Functie: ${stop.groupName !== '—' ? `${stop.groupName} · ` : ''}${stop.functionName}`,
            `Locatie: ${stop.locationName}${stop.city ? ` · ${stop.city}` : ''}`,
            'Controleer daarna de planning opnieuw in de portal',
          ],
        });
      }
    } else {
      const names = [...ids].map((id) => vehiclesById.get(id)?.name).filter(Boolean).join(' en ');
      suggestions.push({
        id: `city-${city}`,
        type: 'info',
        badge: 'Dubbele plaats',
        title: `Meerdere voertuigen in ${cityStopList[0]?.city || city}`,
        description: `${names} hebben op dezelfde dag een stop in dezelfde plaats. De portal markeert dit als vergelijkpunt; zonder route-engine geven we hier nog geen voertuigwissel als harde aanbeveling.`,
        approvable: false,
        checks: [],
        actionLines: [],
      });
    }
  }

  const todayCities = new Map<string, string[]>();
  for (const vehicle of activeVehicles) {
    for (const stop of vehicle.stops) {
      const city = normalizedCity(stop.city);
      if (!city) continue;
      const current = todayCities.get(city) ?? [];
      if (!current.includes(vehicle.name)) current.push(vehicle.name);
      todayCities.set(city, current);
    }
  }

  const tomorrowSeen = new Set<number>();
  for (const stop of tomorrowStops) {
    if (tomorrowSeen.has(stop.projectId)) continue;
    const city = normalizedCity(stop.city);
    const todayVehicles = todayCities.get(city);
    if (!city || !todayVehicles?.length) continue;
    tomorrowSeen.add(stop.projectId);
    suggestions.push({
      id: `tomorrow-${stop.projectId}`,
      type: 'tomorrow-nearby',
      badge: 'Morgen in de buurt',
      title: `#${stop.projectNumber} ligt op een route van vandaag`,
      description: `${stop.projectName} staat morgen in ${stop.city}. Vandaag komt ${todayVehicles.join(', ')} daar al. Controleer of materiaal eventueel eerder mee kan.`,
      approvable: false,
      checks: [
        'Alleen meenemen als locatie eerder kan ontvangen.',
        'Controleer materiaalbeschikbaarheid en opslag op locatie.',
      ],
      actionLines: [],
    });
  }

  for (const vehicle of activeVehicles) {
    if (!vehicle.fuelCardRequired) continue;
    suggestions.push({
      id: `fuel-${vehicle.id}`,
      type: 'fuel-card',
      badge: 'Brandstofpas',
      title: `Brandstofpas controleren voor ${vehicle.name}`,
      description: `Minimaal één geplande stop komt op meer dan ${fuelCardThresholdKm} km retour vanaf het magazijn volgens de Rentman-afstand.`,
      approvable: true,
      checks: ['Na een voertuigwissel opnieuw controleren.'],
      actionLines: [
        `Controleer of de brandstofpas is meegenomen voor ${vehicle.name}`,
        vehicle.licensePlate ? `Kenteken: ${vehicle.licensePlate}` : 'Kenteken ontbreekt in Rentman',
        `Drempel in portal: ${fuelCardThresholdKm} km retour`,
      ],
    });
  }

  return suggestions.slice(0, 12);
}

export default async function LogisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase } = await requirePlanningUser();
  const params = await searchParams;
  const today = dateKey();
  const selectedDate = validDate(valueOf(params.date), today);
  const tomorrow = addDays(selectedDate, 1);

  const [planning, projectVehicles, vehiclesCatalog, settingsResult] = await Promise.all([
    getPlanningProjects(),
    getPlanningProjectVehicles(),
    getPlanningVehicles(),
    supabase
      .from('planning_settings')
      .select('fuel_card_distance_km')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const fuelCardThresholdKm = Number(settingsResult.data?.fuel_card_distance_km ?? 150);
  const projectMap = new Map(planning.allProjects.map((project) => [project.id, project]));

  const todayStops = buildStops(
    projectVehicles.filter((assignment) => overlapsDay(assignment, selectedDate)),
    projectMap,
  );
  const tomorrowStops = buildStops(
    projectVehicles.filter((assignment) => overlapsDay(assignment, tomorrow)),
    projectMap,
  );

  const todayStopsByVehicle = new Map<number, LogisticsStop[]>();
  for (const stop of todayStops) {
    const current = todayStopsByVehicle.get(stop.vehicleId) ?? [];
    current.push(stop);
    todayStopsByVehicle.set(stop.vehicleId, current);
  }

  const routeVehicles: LogisticsVehicle[] = vehiclesCatalog.map((vehicle) => {
    const stops = (todayStopsByVehicle.get(vehicle.id) ?? [])
      .sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
    const referenceDistanceKm = stops.reduce(
      (sum, stop) => sum + (stop.warehouseDistanceKm !== null ? stop.warehouseDistanceKm * 2 : 0),
      0,
    );
    const fuelCardRequired = stops.some(
      (stop) => stop.warehouseDistanceKm !== null && stop.warehouseDistanceKm * 2 > fuelCardThresholdKm,
    );

    return {
      id: vehicle.id,
      name: vehicle.displayname || vehicle.name || `Voertuig ${vehicle.id}`,
      licensePlate: vehicle.licenseplate ?? '',
      stops,
      referenceDistanceKm,
      fuelCardRequired,
    };
  });

  for (const stop of todayStops) {
    if (routeVehicles.some((vehicle) => vehicle.id === stop.vehicleId)) continue;
    routeVehicles.push({
      id: stop.vehicleId,
      name: stop.vehicleName,
      licensePlate: stop.licensePlate,
      stops: todayStops.filter((item) => item.vehicleId === stop.vehicleId),
      referenceDistanceKm: 0,
      fuelCardRequired: false,
    });
  }

  routeVehicles.sort((a, b) => {
    if (a.stops.length && !b.stops.length) return -1;
    if (!a.stops.length && b.stops.length) return 1;
    return a.name.localeCompare(b.name, 'nl');
  });

  const suggestions = buildSuggestions(routeVehicles, tomorrowStops, fuelCardThresholdKm);

  const knownCities = new Set([
    'boesingheliede','vijfhuizen','haarlem','amsterdam','laren','hilversum','utrecht','vianen',
    'den haag','denhaag','rotterdam','dordrecht','breda','eindhoven','arnhem','nijmegen','zwolle',
    'groningen','leeuwarden','alkmaar','antwerpen','antwerp','beveren','beveren-kruibeke-zwijndrecht',
    'brussel','brussels','groot-bijgaarden',
  ]);
  const unmappedStops = todayStops.filter((stop) => {
    const city = normalizedCity(stop.city);
    return city && !knownCities.has(city) && !city.includes('beveren') && !city.includes('antwerpen') && !city.includes('brussel');
  }).length;

  return (
    <LogisticsOptimizer
      selectedDate={selectedDate}
      vehicles={routeVehicles}
      suggestions={suggestions}
      fuelCardThresholdKm={fuelCardThresholdKm}
      unmappedStops={unmappedStops}
    />
  );
}
