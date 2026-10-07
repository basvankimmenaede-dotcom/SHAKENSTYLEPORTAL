'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Copy, Fuel, Map, MessageCircle, Route, Truck, UserRound, X } from 'lucide-react';
import GoogleRoutesMap, { type LogisticsRouteAnalysis } from './GoogleRoutesMap';

export type LogisticsStop = {
  id: number;
  projectId: number;
  projectNumber: string;
  projectName: string;
  ownerId: number;
  ownerName: string;
  ownerMeta: string;
  functionName: string;
  groupName: string;
  start: string | null;
  end: string | null;
  subprojectName: string | null;
  transport: string | null;
  locationName: string;
  address: string;
  city: string;
  warehouseDistanceKm: number | null;
};

export type LogisticsOwner = {
  id: number;
  name: string;
  subtitle: string;
  stops: LogisticsStop[];
  referenceDistanceKm: number;
  fuelCardRequired: boolean;
};

export type LogisticsSuggestion = {
  id: string;
  type: 'vehicle-transfer' | 'tomorrow-nearby' | 'fuel-card' | 'info';
  title: string;
  description: string;
  badge: string;
  approvable: boolean;
  actionLines: string[];
  checks: string[];
};

export type LogisticsDayStatus = {
  date: string;
  label: string;
  dateLabel: string;
  status: 'green' | 'yellow' | 'red' | 'empty';
  summary: string;
};

type Props = {
  selectedDate: string;
  viewMode: 'vehicle' | 'person';
  owners: LogisticsOwner[];
  suggestions: LogisticsSuggestion[];
  fuelCardThresholdKm: number;
  days: LogisticsDayStatus[];
  googleMapsApiKey: string;
  logisticsBaseAddress: string;
};

const ROUTE_COLORS = ['#e86d24', '#2f6f8f', '#6d5c9a', '#3f7f66', '#9a613e', '#6c737d'];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${value}T12:00:00+02:00`));
}

function formatTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function transportLabel(value: string | null) {
  if (!value) return '';
  const normalized = value.toLowerCase();
  if (normalized === 'no_transport') return 'Geen transport';
  if (/(round|both|heen.*terug|return.*out|out.*return)/.test(normalized)) return 'Heen + terug';
  if (/(only.*back|return|terug|inbound)/.test(normalized) && !/(out|heen|there|to)/.test(normalized)) return 'Alleen terug';
  if (/(only.*there|outbound|heen|there|to_location)/.test(normalized)) return 'Alleen heen';
  return value.replaceAll('_', ' ');
}

function transportDirections(value: string | null | undefined) {
  if (!value) return { outbound: true, returnTrip: true };
  const normalized = value.toLowerCase().trim();

  if (normalized === 'no_transport' || normalized === 'no transport') {
    return { outbound: false, returnTrip: false };
  }

  const returnOnly = /(only.*back|return_only|only_return|terug|inbound)/.test(normalized)
    && !/(round|both|outbound|heen|there|to_location)/.test(normalized);
  if (returnOnly) return { outbound: false, returnTrip: true };

  const outboundOnly = /(only.*there|outbound_only|only_outbound|heen|there|to_location)/.test(normalized)
    && !/(round|both|return|terug|inbound)/.test(normalized);
  if (outboundOnly) return { outbound: true, returnTrip: false };

  return { outbound: true, returnTrip: true };
}

type LogisticsTrip = {
  index: number;
  startStopIndex: number;
  endStopIndex: number;
  stops: LogisticsStop[];
};

function buildTrips(owner: LogisticsOwner): LogisticsTrip[] {
  const trips: LogisticsTrip[] = [];
  let current: LogisticsStop[] = [];
  let startStopIndex = 0;

  owner.stops.forEach((stop, stopIndex) => {
    if (current.length === 0) startStopIndex = stopIndex;
    current.push(stop);

    const transport = transportDirections(stop.transport);
    if (transport.returnTrip) {
      trips.push({
        index: trips.length,
        startStopIndex,
        endStopIndex: stopIndex,
        stops: [...current],
      });
      current = [];
    }
  });

  if (current.length > 0) {
    trips.push({
      index: trips.length,
      startStopIndex,
      endStopIndex: owner.stops.length - 1,
      stops: [...current],
    });
  }

  const stopCount = trips.reduce((sum, trip) => sum + trip.stops.length, 0);
  if (stopCount !== owner.stops.length) {
    return [{
      index: 0,
      startStopIndex: 0,
      endStopIndex: owner.stops.length - 1,
      stops: [...owner.stops],
    }];
  }

  return trips;
}

function totalStops(owners: LogisticsOwner[]) {
  return owners.reduce((sum, owner) => sum + owner.stops.length, 0);
}

function dayStatusText(status: LogisticsDayStatus['status']) {
  if (status === 'green') return 'Goed gepland';
  if (status === 'yellow') return 'Optimalisatie mogelijk';
  if (status === 'red') return 'Niet optimaal';
  return 'Geen planning';
}

export default function LogisticsOptimizer({
  selectedDate,
  viewMode,
  owners,
  suggestions,
  fuelCardThresholdKm,
  days,
  googleMapsApiKey,
  logisticsBaseAddress,
}: Props) {
  const [approved, setApproved] = useState<string[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | 'all'>('all');
  const [routeAnalyses, setRouteAnalyses] = useState<Record<number, LogisticsRouteAnalysis>>({});

  const visibleOwners = useMemo(
    () => selectedOwnerId === 'all' ? owners : owners.filter((owner) => owner.id === selectedOwnerId),
    [selectedOwnerId, owners],
  );

  const approvedSuggestions = suggestions.filter((suggestion) => approved.includes(suggestion.id));
  const activeOwners = owners.filter((owner) => owner.stops.length > 0);
  const referenceDistance = activeOwners.reduce((sum, owner) => sum + owner.referenceDistanceKm, 0);
  const mapStops = visibleOwners.flatMap((owner) => owner.stops);
  const visibleAnalyses = visibleOwners
    .map((owner) => routeAnalyses[owner.id])
    .filter((analysis): analysis is LogisticsRouteAnalysis => Boolean(analysis));
  const plannedDistance = visibleAnalyses.reduce((sum, analysis) => sum + analysis.distanceKm, 0);
  const plannedDuration = visibleAnalyses.reduce((sum, analysis) => sum + analysis.durationMinutes, 0);
  const conflictCount = visibleAnalyses.reduce((sum, analysis) => sum + analysis.conflictCount, 0);
  const tightCount = visibleAnalyses.reduce((sum, analysis) => sum + analysis.tightCount, 0);

  function updateRouteAnalyses(analyses: LogisticsRouteAnalysis[]) {
    setRouteAnalyses((current) => {
      const next = { ...current };
      for (const analysis of analyses) next[analysis.ownerId] = analysis;
      return next;
    });
  }

  function formatTravel(minutes: number) {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest ? `${hours}u ${rest}m` : `${hours}u`;
  }

  function addMinutesToTime(value: string | null, minutes: number) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
  }



  function tripStartTime(trip: LogisticsTrip, analysis?: LogisticsRouteAnalysis) {
    const firstStop = trip.stops[0];
    const leg = analysis?.legs[trip.startStopIndex];
    if (!firstStop?.start || !leg || leg.skipped) return null;
    const duration = leg.viaWarehouse?.outboundDurationMinutes ?? leg.durationMinutes;
    return addMinutesToTime(firstStop.start, -duration);
  }

  function tripEndTime(trip: LogisticsTrip, owner: LogisticsOwner, analysis?: LogisticsRouteAnalysis) {
    const lastStop = trip.stops[trip.stops.length - 1];
    if (!lastStop?.end) return null;

    let duration: number | null = null;
    if (trip.endStopIndex === owner.stops.length - 1) {
      const returnLeg = analysis?.legs[owner.stops.length];
      if (returnLeg && !returnLeg.skipped) duration = returnLeg.durationMinutes;
    } else {
      duration = analysis?.legs[trip.endStopIndex + 1]?.viaWarehouse?.returnDurationMinutes ?? null;
    }

    return duration === null ? null : addMinutesToTime(lastStop.end, duration);
  }

  function tripDistanceKm(trip: LogisticsTrip, owner: LogisticsOwner, analysis?: LogisticsRouteAnalysis) {
    if (!analysis) return 0;
    let total = 0;

    trip.stops.forEach((_, localIndex) => {
      const stopIndex = trip.startStopIndex + localIndex;
      const leg = analysis.legs[stopIndex];
      if (!leg || leg.skipped) return;
      total += leg.viaWarehouse?.outboundDistanceKm ?? leg.distanceKm;
    });

    if (trip.endStopIndex === owner.stops.length - 1) {
      const returnLeg = analysis.legs[owner.stops.length];
      if (returnLeg && !returnLeg.skipped) total += returnLeg.distanceKm;
    } else {
      total += analysis.legs[trip.endStopIndex + 1]?.viaWarehouse?.returnDistanceKm ?? 0;
    }

    return total;
  }

  function tripTravelMinutes(trip: LogisticsTrip, owner: LogisticsOwner, analysis?: LogisticsRouteAnalysis) {
    if (!analysis) return 0;
    let total = 0;

    trip.stops.forEach((_, localIndex) => {
      const stopIndex = trip.startStopIndex + localIndex;
      const leg = analysis.legs[stopIndex];
      if (!leg || leg.skipped) return;
      total += leg.viaWarehouse?.outboundDurationMinutes ?? leg.durationMinutes;
    });

    if (trip.endStopIndex === owner.stops.length - 1) {
      const returnLeg = analysis.legs[owner.stops.length];
      if (returnLeg && !returnLeg.skipped) total += returnLeg.durationMinutes;
    } else {
      total += analysis.legs[trip.endStopIndex + 1]?.viaWarehouse?.returnDurationMinutes ?? 0;
    }

    return total;
  }

  function googleMapsTripUrl(trip: LogisticsTrip) {
    if (!trip.stops.length) return '';
    const locations = trip.stops.map((stop) =>
      stop.address || [stop.locationName, stop.city].filter(Boolean).join(', ')
    ).filter(Boolean);
    if (!locations.length) return '';

    const firstTransport = transportDirections(trip.stops[0].transport);
    const lastTransport = transportDirections(trip.stops[trip.stops.length - 1].transport);
    const origin = firstTransport.outbound ? logisticsBaseAddress : locations[0];
    const destination = lastTransport.returnTrip ? logisticsBaseAddress : locations[locations.length - 1];
    const waypointStart = firstTransport.outbound ? 0 : 1;
    const waypointEnd = lastTransport.returnTrip ? locations.length : Math.max(1, locations.length - 1);
    const waypoints = locations.slice(waypointStart, waypointEnd);

    const params = new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'driving',
    });
    if (waypoints.length) params.set('waypoints', waypoints.join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function whatsappTripUrl(owner: LogisticsOwner, trip: LogisticsTrip, analysis?: LogisticsRouteAnalysis) {
    const mapsUrl = googleMapsTripUrl(trip);
    const startTime = tripStartTime(trip, analysis);
    const endTime = tripEndTime(trip, owner, analysis);
    const dayLabel = new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${selectedDate}T12:00:00+02:00`));

    const lines: string[] = [
      `*Rit ${trip.index + 1} · ${dayLabel} – ${owner.name}*`,
      '',
    ];
    if (startTime) lines.push(`Vertrek SHAKENSTYLE: ${formatTime(startTime)}`, '');

    trip.stops.forEach((stop, index) => {
      lines.push(
        `*${index + 1}. #${stop.projectNumber} – ${stop.projectName}*`,
        `${formatTime(stop.start)}–${formatTime(stop.end)}`,
        stop.address || [stop.locationName, stop.city].filter(Boolean).join(', '),
        '',
      );
    });

    if (endTime) lines.push(`Verwacht terug SHAKENSTYLE: ${formatTime(endTime)}`);
    if (analysis) {
      lines.push(`Rit: ${Math.round(tripDistanceKm(trip, owner, analysis))} km · ca. ${formatTravel(tripTravelMinutes(trip, owner, analysis))} reistijd`);
    }
    if (owner.fuelCardRequired) lines.push('⛽ Tankpas meenemen');
    if (mapsUrl) lines.push('', '*Google Maps route:*', mapsUrl);

    return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function approveSuggestion(id: string) {
    setApproved((current) => current.includes(id) ? current : [...current, id]);
  }

  function undoSuggestion(id: string) {
    setApproved((current) => current.filter((item) => item !== id));
  }

  async function copyActions() {
    const lines = approvedSuggestions.flatMap((suggestion) => [
      suggestion.title,
      ...suggestion.actionLines.map((line) => `- ${line}`),
      '',
    ]);
    if (!lines.length) return;
    const text = lines.join('\n').trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  const viewHref = (view: 'vehicle' | 'person') => `/planning/logistics?date=${selectedDate}&view=${view}`;

  return (
    <main className="logisticsPage">
      <header className="logisticsHeader">
        <div>
          <span className="eyebrow">Planning</span>
          <h1>Logistieke optimalisatie</h1>
          <p>Vergelijk routes per voertuig of persoon. De portal adviseert; wijzigingen voer je handmatig door in Rentman.</p>
        </div>

      </header>

      <section className="weekBar" aria-label="Routekwaliteit komende zeven dagen">
        {days.map((day) => (
          <Link
            key={day.date}
            href={`/planning/logistics?date=${day.date}&view=${viewMode}`}
            className={`dayCard ${day.status} ${selectedDate === day.date ? 'selected' : ''}`}
          >
            <div className="dayTop">
              <div className="dayDate">
                <strong>{day.label}</strong>
                <small>{day.dateLabel}</small>
              </div>
              <span className="dayStatusDot" />
            </div>
            <div className="dayMeta">
              <b>{dayStatusText(day.status)}</b>
              <small>{day.summary}</small>
            </div>
          </Link>
        ))}
      </section>

      <section className="toolbar">
        <div className="viewSwitch" aria-label="Filter routeweergave">
          <Link href={viewHref('vehicle')} className={viewMode === 'vehicle' ? 'active' : ''}>
            <span className="viewIcon"><Truck size={18} /></span>
            <span className="viewCopy">
              <strong>Voertuigen</strong>
              <small>Routes per bus</small>
            </span>
          </Link>
          <Link href={viewHref('person')} className={viewMode === 'person' ? 'active' : ''}>
            <span className="viewIcon"><UserRound size={18} /></span>
            <span className="viewCopy">
              <strong>Personen</strong>
              <small>Routes per medewerker</small>
            </span>
          </Link>
        </div>
        <div className="legend">
          <span><i className="green" /> Goed</span>
          <span><i className="yellow" /> Optimalisatie mogelijk</span>
          <span><i className="red" /> Niet optimaal</span>
        </div>
      </section>

      <section className="metricGrid">
        <article>
          <span>{viewMode === 'vehicle' ? 'Voertuigen' : 'Personen'}</span>
          <strong>{activeOwners.length}<small> / {owners.length}</small></strong>
          <p>met planning op {formatDate(selectedDate)}</p>
        </article>
        <article>
          <span>Stops</span>
          <strong>{totalStops(owners)}</strong>
          <p>in de geselecteerde weergave</p>
        </article>
        <article>
          <span>Geplande route</span>
          <strong>{plannedDistance ? Math.round(plannedDistance) : '—'} <small>{plannedDistance ? 'km' : ''}</small></strong>
          <p>{plannedDistance ? `${formatTravel(plannedDuration)} reistijd · vs. ${Math.round(referenceDistance)} km losse retourritten` : 'Google berekent de dagroute'}</p>
        </article>
        <article>
          <span>Aansluitingen</span>
          <strong>{conflictCount ? conflictCount : tightCount ? tightCount : visibleAnalyses.length ? 0 : '—'}</strong>
          <p>{conflictCount ? 'niet haalbaar' : tightCount ? 'krap gepland' : visibleAnalyses.length ? 'geen conflicten gevonden' : 'wordt berekend'}</p>
        </article>
      </section>

      <div className="workspace">
        <section className="ownerPanel">
          <div className="panelHeader">
            <div>
              <span>{viewMode === 'vehicle' ? 'Wagenpark' : 'Personeel'}</span>
              <strong>{viewMode === 'vehicle' ? 'Alle voertuigen vergelijken' : 'Routes per persoon'}</strong>
            </div>
            <button
              type="button"
              className={selectedOwnerId === 'all' ? 'filterChip active' : 'filterChip'}
              onClick={() => setSelectedOwnerId('all')}
            >
              Alles
            </button>
          </div>

          <div className="ownerList">
            {owners.map((owner, index) => {
              const isSelected = selectedOwnerId === owner.id;
              return (
                <button
                  type="button"
                  key={owner.id}
                  className={isSelected ? 'ownerCard selected' : 'ownerCard'}
                  onClick={() => setSelectedOwnerId(isSelected ? 'all' : owner.id)}
                >
                  <span className="ownerColor" style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }} />
                  <span className="ownerMain">
                    <strong>{owner.name}</strong>
                    <small>{owner.subtitle || (viewMode === 'vehicle' ? 'Geen kenteken' : 'Personeel')}</small>
                  </span>
                  <span className="ownerStats">
                    <b>{owner.stops.length} stop{owner.stops.length === 1 ? '' : 's'}</b>
                    <small>{owner.stops.length
                      ? routeAnalyses[owner.id]
                        ? `${Math.round(routeAnalyses[owner.id].distanceKm)} km route`
                        : 'Route berekenen…'
                      : 'Niet gepland'}</small>
                  </span>
                  {owner.fuelCardRequired ? <Fuel size={15} aria-label="Brandstofpas controleren" /> : null}
                </button>
              );
            })}
          </div>

          <div className="routeList">
            {visibleOwners.filter((owner) => owner.stops.length > 0).map((owner) => {
              const analysis = routeAnalyses[owner.id];
              return (
                <div className="routeGroup" key={owner.id}>
                  <div className="routeTitle">
                    {viewMode === 'vehicle' ? <Truck size={16} /> : <UserRound size={16} />}
                    <strong>{owner.name}</strong>
                    {analysis?.conflictCount ? <b className="timelineBadge conflict">{analysis.conflictCount} conflict</b> : null}
                    {!analysis?.conflictCount && analysis?.tightCount ? <b className="timelineBadge tight">{analysis.tightCount} krap</b> : null}
                    {!analysis?.conflictCount && !analysis?.tightCount && analysis ? <b className="timelineBadge good">Haalbaar</b> : null}
                    <span>{owner.stops.length} stops · {buildTrips(owner).length} rit{buildTrips(owner).length === 1 ? '' : 'ten'}</span>
                  </div>

                  <div className="tripList">
                    {buildTrips(owner).map((trip) => {
                      const tripStart = tripStartTime(trip, analysis);
                      const tripEnd = tripEndTime(trip, owner, analysis);
                      const firstLeg = analysis?.legs[trip.startStopIndex];
                      const tripConflict = trip.stops.some((_, localIndex) => {
                        const leg = analysis?.legs[trip.startStopIndex + localIndex];
                        return leg?.status === 'conflict';
                      });
                      const tripTight = !tripConflict && trip.stops.some((_, localIndex) => {
                        const leg = analysis?.legs[trip.startStopIndex + localIndex];
                        return leg?.status === 'tight';
                      });

                      return (
                        <section className="tripCard" key={`${owner.id}-trip-${trip.index}`}>
                          <div className="tripHeader">
                            <div>
                              <strong>Rit {trip.index + 1}</strong>
                              <small>
                                {tripStart ? formatTime(tripStart) : '—'}–{tripEnd ? formatTime(tripEnd) : '—'}
                                {' · '}{trip.stops.length} stop{trip.stops.length === 1 ? '' : 's'}
                              </small>
                            </div>
                            {tripConflict ? <b className="timelineBadge conflict">Conflict</b>
                              : tripTight ? <b className="timelineBadge tight">Krap</b>
                                : analysis ? <b className="timelineBadge good">Haalbaar</b> : null}
                          </div>

                          <div className="timelineStart">
                            <span className="timelineDot warehouse" />
                            <div>
                              <strong>Magazijn</strong>
                              <small>{tripStart ? `${formatTime(tripStart)} · Vertrek` : 'Start rit'}</small>
                            </div>
                          </div>

                          {trip.stops.map((stop, localIndex) => {
                            const stopIndex = trip.startStopIndex + localIndex;
                            const leg = analysis?.legs[stopIndex];
                            const outboundDuration = leg?.viaWarehouse?.outboundDurationMinutes ?? leg?.durationMinutes;
                            const outboundDistance = leg?.viaWarehouse?.outboundDistanceKm ?? leg?.distanceKm;

                            return (
                              <div className="timelineSegment" key={`${owner.id}-trip-${trip.index}-${stop.id}-${stop.projectId}`}>
                                <div className={`travelLeg ${leg?.status || 'travel'}`}>
                                  <span className="travelLine" />
                                  <div>
                                    <strong>{leg?.skipped
                                      ? (leg.note || 'Geen transport in Rentman')
                                      : outboundDuration !== undefined && outboundDistance !== undefined
                                        ? `${formatTravel(outboundDuration)} · ${Math.round(outboundDistance)} km`
                                        : 'Route berekenen…'}</strong>
                                    {!leg?.skipped && leg?.slackMinutes !== null && leg?.slackMinutes !== undefined && localIndex > 0 ? (
                                      <small>{leg.slackMinutes < 0
                                        ? `${Math.abs(Math.round(leg.slackMinutes))} min te laat`
                                        : leg.slackMinutes < 10
                                          ? `${Math.round(leg.slackMinutes)} min marge · krap`
                                          : `${Math.round(leg.slackMinutes)} min marge`}</small>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="timelineStop">
                                  <span className="timelineDot">{localIndex + 1}</span>
                                  <div>
                                    <strong>#{stop.projectNumber} · {stop.projectName}</strong>
                                    <span>{formatTime(stop.start)}–{formatTime(stop.end)} · {stop.city || stop.locationName}</span>
                                    <small>
                                      {stop.subprojectName ? `${stop.subprojectName} · ` : ''}
                                      {stop.groupName !== '—' ? `${stop.groupName} · ` : ''}{stop.functionName}
                                      {viewMode === 'person' && stop.transport ? ` · ${transportLabel(stop.transport)}` : ''}
                                    </small>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {transportDirections(trip.stops[trip.stops.length - 1]?.transport).returnTrip ? (
                            <>
                              <div className="travelLeg return">
                                <span className="travelLine" />
                                <div>
                                  <strong>{analysis
                                    ? `${formatTravel(
                                        trip.endStopIndex === owner.stops.length - 1
                                          ? (analysis.legs[owner.stops.length]?.durationMinutes ?? 0)
                                          : (analysis.legs[trip.endStopIndex + 1]?.viaWarehouse?.returnDurationMinutes ?? 0)
                                      )} · ${Math.round(
                                        trip.endStopIndex === owner.stops.length - 1
                                          ? (analysis.legs[owner.stops.length]?.distanceKm ?? 0)
                                          : (analysis.legs[trip.endStopIndex + 1]?.viaWarehouse?.returnDistanceKm ?? 0)
                                      )} km`
                                    : 'Route berekenen…'}</strong>
                                  <small>Terug naar magazijn</small>
                                </div>
                              </div>

                              <div className="timelineEnd">
                                <span className="timelineDot warehouse" />
                                <div>
                                  <strong>Magazijn</strong>
                                  <small>{tripEnd ? `${formatTime(tripEnd)} · Einde rit` : 'Einde rit'}</small>
                                </div>
                              </div>
                            </>
                          ) : null}

                          <div className="tripActions">
                            {viewMode === 'person' ? (
                              <a
                                className={analysis ? 'whatsappButton' : 'whatsappButton disabled'}
                                href={analysis ? whatsappTripUrl(owner, trip, analysis) : undefined}
                                target="_blank"
                                rel="noreferrer"
                                aria-disabled={!analysis}
                                onClick={(event) => { if (!analysis) event.preventDefault(); }}
                              >
                                <MessageCircle size={14} />
                                Deel rit {trip.index + 1} via WhatsApp
                              </a>
                            ) : null}
                            {analysis ? (
                              <a className="mapsButton" href={googleMapsTripUrl(trip)} target="_blank" rel="noreferrer">
                                <Map size={14} />
                                Open rit in Google Maps
                              </a>
                            ) : null}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  {owner.fuelCardRequired ? (
                    <div className="routeFooter">
                      <div className="routeImportantNote">
                        <Fuel size={14} />
                        <div>
                          <strong>Belangrijke route-info</strong>
                          <small>Tankpas meenemen voor deze route.</small>
                        </div>
                      </div>
                    </div>
                  ) : null}

                    </div>
                  ) : null}
                </div>
              );
            })}
            {!activeOwners.length ? <div className="emptyState">Geen planning gevonden voor deze dag.</div> : null}
          </div>
        </section>

        <section className="mapPanel">
          <div className="panelHeader">
            <div>
              <span>Kaart</span>
              <strong>Google Maps routes</strong>
            </div>
            <Map size={18} />
          </div>

          {googleMapsApiKey ? (
            <GoogleRoutesMap
              apiKey={googleMapsApiKey}
              baseAddress={logisticsBaseAddress}
              owners={visibleOwners}
              onAnalysisChange={updateRouteAnalyses}
            />
          ) : (
            <div className="mapPlaceholder">
              <div className="mapPlaceholderGrid" />
              <div className="mapMessage">
                <Map size={30} />
                <strong>Google Maps nog niet gekoppeld</strong>
                <p>Voeg de Google Maps API-key toe om echte wegen, reistijden en route-optimalisatie te tonen.</p>
              </div>
              <div className="mapStopList">
                {mapStops.slice(0, 8).map((stop) => (
                  <span key={`${stop.ownerId}-${stop.id}-${stop.projectId}`}>
                    <b>#{stop.projectNumber}</b> {stop.city || stop.locationName}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="mapNote">
            <AlertTriangle size={14} />
            Rentman bepaalt de volgorde en tijden. Google controleert de daadwerkelijke reistijd tussen opeenvolgende werkzaamheden en signaleert krappe of onhaalbare aansluitingen.
          </p>
          <p className="mapNote">Start/eindpunt: {logisticsBaseAddress} · Brandstofpasgrens: {fuelCardThresholdKm} km retour.</p>
        </section>

        <aside className="suggestionPanel">
          <div className="panelHeader">
            <div>
              <span>Analyse</span>
              <strong>Slimme voorstellen</strong>
            </div>
            <Route size={18} />
          </div>

          <div className="suggestionList">
            {suggestions.map((suggestion) => {
              const isApproved = approved.includes(suggestion.id);
              return (
                <article className={isApproved ? 'suggestion approved' : 'suggestion'} key={suggestion.id}>
                  <div className="suggestionTop">
                    <span className={`suggestionBadge ${suggestion.type}`}>{suggestion.badge}</span>
                    {isApproved ? <span className="approvedLabel"><Check size={13} /> Goedgekeurd</span> : null}
                  </div>
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.description}</p>
                  {suggestion.checks.length ? (
                    <div className="checks">
                      {suggestion.checks.map((check) => <span key={check}><ChevronRight size={12} /> {check}</span>)}
                    </div>
                  ) : null}
                  {suggestion.approvable ? (
                    isApproved ? (
                      <button type="button" className="textAction" onClick={() => undoSuggestion(suggestion.id)}><X size={13} /> Ongedaan maken</button>
                    ) : (
                      <button type="button" className="approveButton" onClick={() => approveSuggestion(suggestion.id)}>Voorstel goedkeuren</button>
                    )
                  ) : null}
                </article>
              );
            })}
            {!suggestions.length ? <div className="emptyState">Geen concrete route-optimalisaties gevonden. Operationele aandachtspunten staan bij de betreffende route.</div> : null}
          </div>
        </aside>
      </div>

      <section className="actionPanel">
        <div className="actionHeader">
          <div>
            <span>Handmatig doorvoeren</span>
            <h2>Rentman-actielijst</h2>
            <p>De portal wijzigt Rentman niet. Na goedkeuren staat hier exact wat je handmatig moet controleren of aanpassen.</p>
          </div>
          <button type="button" className="button secondary" onClick={copyActions} disabled={!approvedSuggestions.length}>
            <Copy size={15} /> Kopieer actielijst
          </button>
        </div>

        {approvedSuggestions.length ? (
          <div className="actionGrid">
            {approvedSuggestions.map((suggestion) => (
              <article key={suggestion.id}>
                <span>GOEDGEKEURD · NOG DOORVOEREN</span>
                <strong>{suggestion.title}</strong>
                {suggestion.actionLines.map((line) => <p key={line}><Check size={14} /> {line}</p>)}
              </article>
            ))}
          </div>
        ) : (
          <div className="emptyAction">Keur een voorstel goed om de concrete Rentman-acties hier te tonen.</div>
        )}
      </section>

      <style jsx global>{`
        .logisticsPage{width:100%;max-width:1720px;margin:0 auto;padding:26px 28px 56px;color:var(--ink)}
        .logisticsHeader{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;margin-bottom:20px}
        .logisticsHeader>div{min-width:0}
        .eyebrow,.panelHeader span,.actionHeader span{display:block;color:var(--orange-dark);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
        h1{margin:4px 0 7px;font-size:clamp(34px,3vw,46px);line-height:1;letter-spacing:-.045em}
        .logisticsHeader p,.actionHeader p{margin:0;color:var(--muted);max-width:860px;font-size:14px;line-height:1.45}

        .weekBar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-bottom:14px}
        .dayCard{position:relative;min-width:0;min-height:94px;display:flex;flex-direction:column;justify-content:space-between;padding:14px 15px 13px;border:1px solid transparent;border-radius:16px;color:#24211e;overflow:hidden;transition:box-shadow .15s ease,transform .15s ease,filter .15s ease}
        .dayCard.empty{background:#efede9;border-color:#e2dfd9}
        .dayCard.green{background:#dff2e5;border-color:#c7e6d1}
        .dayCard.yellow{background:#fff0bd;border-color:#f0db8a}
        .dayCard.red{background:#f9dfdb;border-color:#efc2bc}
        .dayCard:hover{filter:saturate(1.04);box-shadow:0 7px 20px rgba(28,24,20,.08);transform:translateY(-1px)}
        .dayCard.selected{box-shadow:0 0 0 2px #24211e inset,0 7px 20px rgba(28,24,20,.08)}
        .dayTop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
        .dayDate{display:flex;align-items:baseline;gap:5px;min-width:0}
        .dayDate strong{font-size:15px;line-height:1.05;text-transform:capitalize;white-space:nowrap}
        .dayDate small{font-size:10px;color:rgba(36,33,30,.58);white-space:nowrap}
        .dayStatusDot{display:none}
        .dayMeta{display:grid;grid-template-columns:minmax(0,1fr);gap:3px;min-width:0}
        .dayMeta b{font-size:10px;line-height:1.15;white-space:nowrap}
        .dayMeta small{font-size:9px;color:rgba(36,33,30,.62);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .dayCard.empty .dayMeta b{color:#6f6a64}
        .dayCard.green .dayMeta b{color:#2f6f44}
        .dayCard.yellow .dayMeta b{color:#8a6500}
        .dayCard.red .dayMeta b{color:#9e4037}

        .toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 14px}
        .viewSwitch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(430px,100%)}
        .viewSwitch a{min-width:0;display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
        .viewSwitch a:hover{border-color:#d8c7ba;box-shadow:0 4px 14px rgba(28,24,20,.05)}
        .viewSwitch a.active{border-color:#f37021;background:#fff6ef;box-shadow:0 0 0 1px rgba(243,112,33,.14)}
        .viewIcon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#f2f0ec;color:#716b64}
        .viewSwitch a.active .viewIcon{background:#fee7d7;color:#e76416}
        .viewCopy{display:grid;gap:2px;min-width:0}
        .viewCopy strong{font-size:11px;line-height:1.1}
        .viewCopy small{font-size:8px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .legend{display:flex;gap:14px;flex-wrap:wrap}
        .legend span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:9px;font-weight:800}
        .legend i{width:9px;height:9px;border-radius:50%}.legend .green{background:#4fa36d}.legend .yellow{background:#e4b13b}.legend .red{background:#cf5a4e}

        .metricGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
        .metricGrid article{min-width:0;padding:13px 16px;border:1px solid var(--line);border-radius:14px;background:#fff}
        .metricGrid article>span{font-size:10px;font-weight:800;color:var(--muted)}
        .metricGrid strong{display:block;margin-top:3px;font-size:25px;line-height:1.05;letter-spacing:-.035em}
        .metricGrid strong small{font-size:12px;color:var(--muted);font-weight:700}
        .metricGrid p{margin:4px 0 0;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        .workspace{display:grid;grid-template-columns:minmax(320px,360px) minmax(560px,1fr) minmax(320px,365px);gap:12px;align-items:start}
        .ownerPanel,.mapPanel,.suggestionPanel,.actionPanel{min-width:0;border:1px solid var(--line);border-radius:16px;background:#fff;overflow:hidden}
        .panelHeader{height:58px;padding:0 14px;border-bottom:1px solid var(--line);background:#fbfaf8;display:flex;align-items:center;justify-content:space-between;gap:12px}
        .panelHeader>div{display:grid;gap:3px;min-width:0}.panelHeader strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .filterChip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 11px;font-weight:800;font-size:9px;cursor:pointer}
        .filterChip.active{border-color:var(--orange);color:var(--orange-dark);background:var(--orange-soft)}

        .ownerList{display:grid;border-bottom:1px solid var(--line)}
        .ownerCard{width:100%;display:grid;grid-template-columns:6px minmax(0,1fr) auto auto;gap:9px;align-items:center;padding:10px 13px;border:0;border-bottom:1px solid #efede8;background:#fff;text-align:left;cursor:pointer}
        .ownerCard:last-child{border-bottom:0}.ownerCard:hover,.ownerCard.selected{background:#fff8f3}
        .ownerColor{width:6px;height:31px;border-radius:999px}
        .ownerMain,.ownerStats{display:grid;gap:2px;min-width:0}
        .ownerMain strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ownerMain small,.ownerStats small{font-size:8px;color:var(--muted)}
        .ownerStats{text-align:right}.ownerStats b{font-size:8px;white-space:nowrap}
        .routeList{display:grid;overflow:visible}
        .routeGroup{border-bottom:1px solid var(--line);padding-bottom:10px}.routeGroup:last-child{border-bottom:0}
        .tripList{display:grid;gap:10px;padding:10px}.tripCard{border:1px solid #e7e2dc;border-radius:12px;overflow:hidden;background:#fff}.tripHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#fbfaf8;border-bottom:1px solid #eee9e3}.tripHeader>div{display:grid;gap:2px}.tripHeader strong{font-size:9px}.tripHeader small{font-size:8px;color:var(--muted)}.tripActions{display:grid;grid-template-columns:1fr;gap:6px;padding:8px 10px 10px}.mapsButton{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;color:#514b45;font-size:8px;font-weight:900;text-decoration:none}.mapsButton:hover{background:#f8f6f2}

        .routeTitle{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:7px;padding:10px 11px;background:#f8f7f4;font-size:9px;border-bottom:1px solid #eee9e3}
        .routeTitle span{margin-left:auto;color:var(--muted)}
        .timelineBadge{padding:4px 6px;border-radius:999px;font-size:7px;white-space:nowrap}.timelineBadge.good{background:#e5f4e9;color:#2f6f44}.timelineBadge.tight{background:#fff0bd;color:#8a6500}.timelineBadge.conflict{background:#f9dfdb;color:#9e4037}
        .timelineStart,.timelineEnd,.timelineStop,.timelineMiddleWarehouse{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;padding:10px 12px}
        .timelineStart,.timelineEnd{background:#fcfbf9}.timelineMiddleWarehouse{background:#f7f5f1;border-top:1px solid #eee9e3;border-bottom:1px solid #eee9e3}.timelineStart>div,.timelineEnd>div,.timelineStop>div,.timelineMiddleWarehouse>div{display:grid;gap:2px;min-width:0}
        .timelineStart strong,.timelineEnd strong,.timelineStop strong,.timelineMiddleWarehouse strong{font-size:9px}.timelineStart small,.timelineEnd small,.timelineStop span,.timelineStop small,.timelineMiddleWarehouse small{font-size:8px;color:var(--muted)}
        .timelineStop strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .timelineDot{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:var(--orange-soft);color:var(--orange-dark);font-size:8px;font-weight:900;border:1px solid #f6d2bc;position:relative;z-index:1}
        .timelineDot.warehouse{background:#ece9e4;color:#56514b;border-color:#ded9d2}
        .travelLeg{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;padding:4px 12px;min-height:42px}
        .travelLeg>div{display:grid;gap:2px;min-width:0}.travelLeg strong{font-size:8px;color:#5d5751}.travelLeg small{font-size:8px;color:var(--muted)}
        .travelLine{width:2px;height:34px;background:#d9d4cd;justify-self:center;border-radius:999px}.travelLeg.good .travelLine{background:#7fbe91}.travelLeg.tight .travelLine{background:#e4b13b}.travelLeg.conflict .travelLine{background:#cf5a4e}.travelLeg.return .travelLine{background:#aaa39b}
        .travelLeg.good small{color:#347043}.travelLeg.tight small{color:#8a6500;font-weight:800}.travelLeg.conflict small{color:#a33e34;font-weight:900}
        .routeFooter{display:grid;gap:8px;padding:10px 12px 2px}
        .routeImportantNote{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;align-items:center;padding:9px 10px;border:1px solid #eadca9;border-radius:10px;background:#fff9df;color:#6d5700}
        .routeImportantNote>div{display:grid;gap:1px}.routeImportantNote strong{font-size:8px}.routeImportantNote small{font-size:8px;color:#7c6a27}
        .whatsappButton{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 10px;border:1px solid #cfded2;border-radius:10px;background:#f5fbf6;color:#2f6f44;font-size:8px;font-weight:900;text-decoration:none}
        .whatsappButton:hover{background:#edf7ef;border-color:#a9c9b0}.whatsappButton.disabled{opacity:.45;cursor:not-allowed}

        .mapPanel{background:#fff}
        .mapPlaceholder{position:relative;min-height:500px;display:grid;place-items:center;background:#eef0ed;overflow:hidden}
        .mapPlaceholderGrid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.8) 1px,transparent 1px);background-size:42px 42px;transform:rotate(-9deg) scale(1.2);opacity:.7}
        .mapMessage{position:relative;z-index:2;width:min(360px,calc(100% - 40px));padding:20px;border:1px solid #d8d9d5;border-radius:14px;background:rgba(255,255,255,.94);text-align:center;box-shadow:0 12px 35px rgba(0,0,0,.08)}
        .mapMessage strong{display:block;margin-top:8px;font-size:14px}.mapMessage p{margin:7px 0 0;color:var(--muted);font-size:9px;line-height:1.5}
        .mapStopList{position:absolute;left:12px;right:12px;bottom:12px;z-index:2;display:flex;flex-wrap:wrap;gap:5px}
        .mapStopList span{padding:5px 7px;border:1px solid rgba(0,0,0,.1);border-radius:999px;background:rgba(255,255,255,.94);font-size:8px}
        .mapNote{display:flex;gap:7px;align-items:flex-start;margin:0;padding:8px 12px;border-top:1px solid var(--line);color:var(--muted);font-size:8px;line-height:1.4}

        .suggestionPanel{max-height:640px}
        .suggestionList{display:grid;max-height:582px;overflow:auto}
        .suggestion{padding:13px;border-bottom:1px solid var(--line);display:grid;gap:8px}.suggestion:last-child{border-bottom:0}.suggestion.approved{background:#f6fbf7}
        .suggestionTop{display:flex;justify-content:space-between;align-items:center;gap:8px}
        .suggestionBadge{width:fit-content;padding:4px 7px;border-radius:999px;background:#f1efeb;color:#625e58;font-size:7px;font-weight:900;text-transform:uppercase}
        .suggestionBadge.vehicle-transfer{background:#fff0e6;color:#8b3b12}.suggestionBadge.tomorrow-nearby{background:#eef5fb;color:#2c607d}.suggestionBadge.fuel-card{background:#fff5cc;color:#715800}
        .approvedLabel{display:flex;align-items:center;gap:4px;color:#347043;font-size:8px;font-weight:900}
        .suggestion>strong{font-size:10px;line-height:1.35}.suggestion p{margin:0;color:var(--muted);font-size:8px;line-height:1.5}
        .checks{display:grid;gap:4px}.checks span{display:flex;gap:3px;color:#6a655f;font-size:8px;line-height:1.35}
        .approveButton{width:100%;border:1px solid var(--orange);border-radius:9px;background:var(--orange);color:#fff;padding:9px 10px;font-size:8px;font-weight:900;cursor:pointer}
        .textAction{width:fit-content;display:flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--muted);font-size:8px;font-weight:800;cursor:pointer;padding:2px 0}

        .actionPanel{margin-top:12px;padding:17px 18px}.actionHeader{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}
        .actionHeader h2{margin:5px 0;font-size:21px}.actionHeader :global(.button){display:inline-flex;align-items:center;gap:7px}.actionHeader :global(.button:disabled){opacity:.45}
        .actionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
        .actionGrid article{padding:12px;border:1px solid #cfe0d2;border-radius:12px;background:#f8fcf9;display:grid;gap:6px}
        .actionGrid article>span{font-size:8px;font-weight:900;color:#347043}.actionGrid article>strong{font-size:10px}.actionGrid p{display:flex;gap:6px;margin:0;font-size:8px;color:#4e5c51}
        .emptyState,.emptyAction{padding:20px;color:var(--muted);font-size:9px;text-align:center}.emptyAction{margin-top:14px;border:1px dashed var(--line);border-radius:12px}

        @media(max-width:1380px){
          .logisticsPage{padding-inline:20px}
          .weekBar{grid-template-columns:repeat(4,minmax(0,1fr))}
          .workspace{grid-template-columns:minmax(300px,340px) minmax(520px,1fr)}
          .suggestionPanel{grid-column:1/-1;max-height:none}.suggestionList{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none}
        }
        @media(max-width:900px){
          .logisticsPage{padding:22px 14px 44px}
          .logisticsHeader,.actionHeader,.toolbar{align-items:stretch;flex-direction:column}
          
          .metricGrid{grid-template-columns:1fr 1fr}.weekBar{grid-template-columns:repeat(2,minmax(0,1fr))}
          .workspace{grid-template-columns:1fr}.suggestionPanel{grid-column:auto}.suggestionList{grid-template-columns:1fr}
          .routeList{max-height:none}.mapPlaceholder{min-height:420px}.actionGrid{grid-template-columns:1fr}
        }
        @media(max-width:560px){
          h1{font-size:34px}.metricGrid{grid-template-columns:1fr}.weekBar{grid-template-columns:1fr 1fr}
          .ownerCard{grid-template-columns:6px minmax(0,1fr) auto}.ownerCard>svg{display:none}
          .legend{display:none}
        }
      `}</style>
    </main>
  );
}
