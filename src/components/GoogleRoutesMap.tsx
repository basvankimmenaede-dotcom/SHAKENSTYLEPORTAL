/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, MapPinned, Route } from 'lucide-react';
import type { LogisticsOwner } from './LogisticsOptimizer';

const ROUTE_COLORS = ['#f37021', '#2f6f8f', '#6d5c9a', '#3f7f66', '#9a613e', '#6c737d'];

export type LogisticsRouteLegAnalysis = {
  index: number;
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  durationMinutes: number;
  slackMinutes: number | null;
  status: 'good' | 'tight' | 'conflict' | 'travel';
  skipped?: boolean;
  note?: string;
};

export type LogisticsRouteAnalysis = {
  ownerId: number;
  ownerName: string;
  distanceKm: number;
  durationMinutes: number;
  legs: LogisticsRouteLegAnalysis[];
  conflictCount: number;
  tightCount: number;
};

type RouteSummary = LogisticsRouteAnalysis & {
  id: number;
  name: string;
  color: string;
  error?: string;
};

type Props = {
  apiKey: string;
  baseAddress: string;
  owners: LogisticsOwner[];
  onAnalysisChange?: (analyses: LogisticsRouteAnalysis[]) => void;
};

declare global {
  interface Window {
    google?: any;
    __snsGoogleMapsPromise?: Promise<void>;
    __snsInitGoogleMaps?: () => void;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (window.__snsGoogleMapsPromise) return window.__snsGoogleMapsPromise;

  window.__snsGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      delete window.__snsInitGoogleMaps;

      if (window.google?.maps?.importLibrary) {
        resolve();
      } else {
        reject(new Error('Google Maps is geladen, maar de Maps-library is niet beschikbaar.'));
      }
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      delete window.__snsInitGoogleMaps;
      window.__snsGoogleMapsPromise = undefined;
      reject(new Error(message));
    };

    const timeoutId = window.setTimeout(
      () => fail('Google Maps reageerde niet binnen 12 seconden. Controleer API-key, billing en domeinrestricties.'),
      12000,
    );

    window.__snsInitGoogleMaps = finish;

    const existing = document.querySelector<HTMLScriptElement>('script[data-sns-google-maps]');
    if (existing) {
      if (window.google?.maps?.importLibrary) {
        finish();
        return;
      }

      existing.addEventListener('error', () => fail('Google Maps kon niet worden geladen.'), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.snsGoogleMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=__snsInitGoogleMaps&language=nl&region=NL`;
    script.async = true;
    script.defer = true;
    script.onerror = () => fail('Google Maps kon niet worden geladen.');
    document.head.appendChild(script);
  });

  return window.__snsGoogleMapsPromise;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}u ${rest}m` : `${hours}u`;
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

type RouteNode =
  | { kind: 'warehouse'; location: string; reason: 'start' | 'between' | 'end' }
  | { kind: 'stop'; location: string; stop: LogisticsOwner['stops'][number]; stopIndex: number };

function buildRouteNodes(baseAddress: string, stops: LogisticsOwner['stops']) {
  const nodes: RouteNode[] = [];

  stops.forEach((stop, index) => {
    const location = stop.address || [stop.locationName, stop.city].filter(Boolean).join(', ');
    if (!location) return;

    const transport = transportDirections(stop.transport);
    const previous = stops[index - 1];
    const previousTransport = previous ? transportDirections(previous.transport) : null;

    if (index === 0) {
      if (transport.outbound) nodes.push({ kind: 'warehouse', location: baseAddress, reason: 'start' });
      nodes.push({ kind: 'stop', location, stop, stopIndex: index });
      if (transport.returnTrip) {
        nodes.push({ kind: 'warehouse', location: baseAddress, reason: index === stops.length - 1 ? 'end' : 'between' });
      }
      return;
    }

    const lastNode = nodes[nodes.length - 1];
    const previousEndedAtWarehouse = lastNode?.kind === 'warehouse';

    if (transport.outbound && !previousEndedAtWarehouse) {
      nodes.push({ kind: 'warehouse', location: baseAddress, reason: 'between' });
    } else if (!transport.outbound && previousTransport?.returnTrip && !previousEndedAtWarehouse) {
      nodes.push({ kind: 'warehouse', location: baseAddress, reason: 'between' });
    }

    nodes.push({ kind: 'stop', location, stop, stopIndex: index });

    if (transport.returnTrip) {
      nodes.push({ kind: 'warehouse', location: baseAddress, reason: index === stops.length - 1 ? 'end' : 'between' });
    }
  });

  return nodes;
}

export default function GoogleRoutesMap({ apiKey, baseAddress, owners, onAnalysisChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [summaries, setSummaries] = useState<RouteSummary[]>([]);

  const activeOwners = useMemo(
    () => owners.filter((owner) => owner.stops.some((stop) => stop.address || stop.city)),
    [owners],
  );

  useEffect(() => {
    let cancelled = false;
    const overlays: any[] = [];

    async function init() {
      if (!mapRef.current) return;
      setState('loading');
      setError('');
      setSummaries([]);

      try {
        await loadGoogleMaps(apiKey);
        if (cancelled) return;
        if (!window.google?.maps?.importLibrary) {
          throw new Error('Google Maps is geladen, maar importLibrary ontbreekt.');
        }

        const [{ Map }, { Route: GoogleRoute }, { LatLngBounds }] = await Promise.all([
          window.google.maps.importLibrary('maps'),
          window.google.maps.importLibrary('routes'),
          window.google.maps.importLibrary('core'),
        ]);

        if (cancelled || !mapRef.current) return;

        const map = new Map(mapRef.current, {
          center: { lat: 52.15, lng: 5.25 },
          zoom: 7,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          mapId: 'DEMO_MAP_ID',
          gestureHandling: 'greedy',
        });

        const bounds = new LatLngBounds();
        const routeSummaries: RouteSummary[] = [];

        for (let ownerIndex = 0; ownerIndex < activeOwners.length; ownerIndex += 1) {
          const owner = activeOwners[ownerIndex];
          const waypointStops = owner.stops.filter(
            (stop) => stop.address || stop.locationName || stop.city,
          );
          const stopLocations = waypointStops.map(
            (stop) => stop.address || [stop.locationName, stop.city].filter(Boolean).join(', '),
          );

          if (!stopLocations.length) continue;

          const routeNodes = buildRouteNodes(baseAddress, waypointStops);

          if (routeNodes.length < 2) {
            routeSummaries.push({
              id: owner.id,
              ownerId: owner.id,
              name: owner.name,
              ownerName: owner.name,
              color: ROUTE_COLORS[ownerIndex % ROUTE_COLORS.length],
              distanceKm: 0,
              durationMinutes: 0,
              legs: [{
                index: 0,
                fromLabel: 'Geen heenreis',
                toLabel: `#${waypointStops[0].projectNumber} · ${waypointStops[0].city || waypointStops[0].locationName}`,
                distanceKm: 0,
                durationMinutes: 0,
                slackMinutes: null,
                status: 'travel',
                skipped: true,
                note: 'Geen transport ingesteld in Rentman',
              }],
              conflictCount: 0,
              tightCount: 0,
            });
            continue;
          }

          const color = ROUTE_COLORS[ownerIndex % ROUTE_COLORS.length];

          try {
            const request: any = {
              origin: routeNodes[0].location,
              destination: routeNodes[routeNodes.length - 1].location,
              intermediates: routeNodes.slice(1, -1).map((node) => ({ location: node.location })),
              travelMode: 'DRIVING',
              optimizeWaypointOrder: false,
              routingPreference: 'TRAFFIC_AWARE',
              fields: [
                'path',
                'legs',
                'distanceMeters',
                'durationMillis',
              ],
            };

            const response = await GoogleRoute.computeRoutes(request);
            const route = response?.routes?.[0];

            if (!route) {
              routeSummaries.push({
                id: owner.id,
                name: owner.name,
                color,
                ownerId: owner.id,
                ownerName: owner.name,
                distanceKm: 0,
                durationMinutes: 0,
                legs: [],
                conflictCount: 0,
                tightCount: 0,
                error: 'Geen route gevonden',
              });
              continue;
            }

            const polylines = route.createPolylines({
              polylineOptions: {
                strokeColor: color,
                strokeOpacity: 0.9,
                strokeWeight: 5,
                zIndex: activeOwners.length - ownerIndex,
              },
            });

            polylines.forEach((polyline: any) => {
              polyline.setMap(map);
              overlays.push(polyline);
            });

            const markers = await route.createWaypointAdvancedMarkers();
            markers.forEach((marker: any) => {
              marker.map = map;
              overlays.push(marker);
            });

            (route.path || []).forEach((point: any) => bounds.extend(point));

            const routeLegs = Array.isArray(route.legs) ? route.legs : [];
            const googleLegs = routeLegs.map((leg: any, legIndex: number) => {
              const fromNode = routeNodes[legIndex];
              const toNode = routeNodes[legIndex + 1];
              const fromStop = fromNode?.kind === 'stop' ? fromNode.stop : null;
              const toStop = toNode?.kind === 'stop' ? toNode.stop : null;
              const durationMinutes = Number(leg?.durationMillis || 0) / 60000;
              const distanceKm = Number(leg?.distanceMeters || 0) / 1000;

              let slackMinutes: number | null = null;
              if (fromStop?.end && toStop?.start) {
                const availableMinutes = (new Date(toStop.start).getTime() - new Date(fromStop.end).getTime()) / 60000;
                if (Number.isFinite(availableMinutes)) slackMinutes = availableMinutes - durationMinutes;
              }

              return {
                fromNode,
                toNode,
                fromLabel: fromStop ? `#${fromStop.projectNumber} · ${fromStop.city || fromStop.locationName}` : 'Magazijn',
                toLabel: toStop ? `#${toStop.projectNumber} · ${toStop.city || toStop.locationName}` : 'Magazijn',
                distanceKm,
                durationMinutes,
                slackMinutes,
              };
            });

            const legs: LogisticsRouteLegAnalysis[] = [];

            waypointStops.forEach((stop, stopIndex) => {
              const inbound = googleLegs.find((leg: any) => leg.toNode?.kind === 'stop' && leg.toNode.stopIndex === stopIndex);
              if (inbound) {
                let slackMinutes: number | null = inbound.slackMinutes;

                if (stopIndex > 0) {
                  const previousStop = waypointStops[stopIndex - 1];
                  const previousStopNodeIndex = routeNodes.findIndex(
                    (node) => node.kind === 'stop' && node.stopIndex === stopIndex - 1,
                  );
                  const currentStopNodeIndex = routeNodes.findIndex(
                    (node) => node.kind === 'stop' && node.stopIndex === stopIndex,
                  );

                  if (previousStop?.end && stop.start && previousStopNodeIndex >= 0 && currentStopNodeIndex > previousStopNodeIndex) {
                    const travelBetweenStops = googleLegs
                      .slice(previousStopNodeIndex, currentStopNodeIndex)
                      .reduce((sum: number, segment: any) => sum + segment.durationMinutes, 0);
                    const availableMinutes = (new Date(stop.start).getTime() - new Date(previousStop.end).getTime()) / 60000;
                    if (Number.isFinite(availableMinutes)) slackMinutes = availableMinutes - travelBetweenStops;
                  }
                }

                const status: LogisticsRouteLegAnalysis['status'] =
                  slackMinutes === null ? 'travel'
                    : slackMinutes < 0 ? 'conflict'
                      : slackMinutes < 10 ? 'tight'
                        : 'good';

                legs.push({
                  index: stopIndex,
                  fromLabel: inbound.fromLabel,
                  toLabel: inbound.toLabel,
                  distanceKm: inbound.distanceKm,
                  durationMinutes: inbound.durationMinutes,
                  slackMinutes,
                  status,
                });
              } else {
                legs.push({
                  index: stopIndex,
                  fromLabel: stopIndex === 0 ? 'Geen heenreis' : 'Vorige locatie',
                  toLabel: `#${stop.projectNumber} · ${stop.city || stop.locationName}`,
                  distanceKm: 0,
                  durationMinutes: 0,
                  slackMinutes: null,
                  status: 'travel',
                  skipped: true,
                  note: 'Geen heenreis ingesteld in Rentman',
                });
              }
            });

            const returnLeg = googleLegs.find((leg: any) =>
              leg.fromNode?.kind === 'stop'
              && leg.fromNode.stopIndex === waypointStops.length - 1
              && leg.toNode?.kind === 'warehouse'
            );

            legs.push(returnLeg ? {
              index: waypointStops.length,
              fromLabel: returnLeg.fromLabel,
              toLabel: 'Magazijn',
              distanceKm: returnLeg.distanceKm,
              durationMinutes: returnLeg.durationMinutes,
              slackMinutes: null,
              status: 'travel',
            } : {
              index: waypointStops.length,
              fromLabel: `#${waypointStops[waypointStops.length - 1].projectNumber} · ${waypointStops[waypointStops.length - 1].city || waypointStops[waypointStops.length - 1].locationName}`,
              toLabel: 'Geen terugreis',
              distanceKm: 0,
              durationMinutes: 0,
              slackMinutes: null,
              status: 'travel',
              skipped: true,
              note: 'Geen terugreis ingesteld in Rentman',
            });

            routeSummaries.push({
              id: owner.id,
              ownerId: owner.id,
              name: owner.name,
              ownerName: owner.name,
              color,
              distanceKm: Number(route.distanceMeters || 0) / 1000,
              durationMinutes: Number(route.durationMillis || 0) / 60000,
              legs,
              conflictCount: legs.filter((leg) => leg.status === 'conflict').length,
              tightCount: legs.filter((leg) => leg.status === 'tight').length,
            });
          } catch (routeError) {
            routeSummaries.push({
              id: owner.id,
              name: owner.name,
              color,
              ownerId: owner.id,
              ownerName: owner.name,
              distanceKm: 0,
              durationMinutes: 0,
              legs: [],
              conflictCount: 0,
              tightCount: 0,
              error: routeError instanceof Error ? routeError.message : 'Route kon niet worden berekend',
            });
          }
        }

        if (!cancelled) {
          if (!bounds.isEmpty()) map.fitBounds(bounds, 52);
          setSummaries(routeSummaries);
          onAnalysisChange?.(routeSummaries.filter((summary) => !summary.error).map((summary) => ({
            ownerId: summary.ownerId,
            ownerName: summary.ownerName,
            distanceKm: summary.distanceKm,
            durationMinutes: summary.durationMinutes,
            legs: summary.legs,
            conflictCount: summary.conflictCount,
            tightCount: summary.tightCount,
          })));
          setState('ready');
        }
      } catch (mapError) {
        if (!cancelled) {
          setState('error');
          setError(mapError instanceof Error ? mapError.message : 'Google Maps kon niet worden gestart.');
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      overlays.forEach((overlay) => {
        if ('setMap' in overlay) overlay.setMap(null);
        else if ('map' in overlay) overlay.map = null;
      });
    };
  }, [apiKey, baseAddress, activeOwners]);

  const validSummaries = summaries.filter((summary) => !summary.error);
  const totalDistance = validSummaries.reduce((sum, item) => sum + item.distanceKm, 0);
  const totalDuration = validSummaries.reduce((sum, item) => sum + item.durationMinutes, 0);

  return (
    <div className="googleRoutesWrap">
      <div ref={mapRef} className="googleRoutesCanvas" />

      {state === 'loading' ? (
        <div className="googleRoutesOverlay">
          <LoaderCircle size={28} className="spin" />
          <strong>Routes worden berekend…</strong>
          <span>Google Maps vergelijkt de geplande stops.</span>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="googleRoutesOverlay error">
          <AlertTriangle size={28} />
          <strong>Google Maps kon niet starten</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {state === 'ready' && !activeOwners.length ? (
        <div className="googleRoutesOverlay">
          <MapPinned size={28} />
          <strong>Geen routes voor deze selectie</strong>
          <span>Kies een andere dag, bus of persoon.</span>
        </div>
      ) : null}

      {state === 'ready' && validSummaries.length ? (
        <>
          <div className="googleRoutesTopbar">
            <span><Route size={14} /> {Math.round(totalDistance)} km</span>
            <span>{formatDuration(totalDuration)} reistijd</span>
            <span><CheckCircle2 size={14} /> Google Routes</span>
          </div>

          <div className="googleRoutesLegend">
            {summaries.map((summary) => (
              <div className={summary.error ? 'routeLegendItem error' : 'routeLegendItem'} key={summary.id}>
                <i style={{ backgroundColor: summary.color }} />
                <div>
                  <strong>{summary.name}</strong>
                  {summary.error ? (
                    <small>{summary.error}</small>
                  ) : (
                    <>
                      <small>{Math.round(summary.distanceKm)} km · {formatDuration(summary.durationMinutes)}</small>
                      {summary.conflictCount ? <small className="routeConflict">{summary.conflictCount} aansluiting(en) niet haalbaar</small> : null}
                      {!summary.conflictCount && summary.tightCount ? <small className="routeTight">{summary.tightCount} krappe aansluiting(en)</small> : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <style jsx>{`
        .googleRoutesWrap{position:relative;min-height:520px;background:#ecebe7}
        .googleRoutesCanvas{position:absolute;inset:0;min-height:520px}
        .googleRoutesOverlay{position:absolute;inset:0;z-index:5;display:grid;place-items:center;align-content:center;gap:8px;padding:28px;text-align:center;background:rgba(247,246,243,.86);backdrop-filter:blur(2px)}
        .googleRoutesOverlay strong{font-size:14px}.googleRoutesOverlay span{max-width:340px;color:var(--muted);font-size:9px;line-height:1.5}
        .googleRoutesOverlay.error{color:#9c3e31}
        .googleRoutesTopbar{position:absolute;top:12px;left:12px;z-index:4;display:flex;gap:6px;flex-wrap:wrap}
        .googleRoutesTopbar span{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid rgba(0,0,0,.1);border-radius:999px;background:rgba(255,255,255,.96);box-shadow:0 5px 18px rgba(0,0,0,.08);font-size:8px;font-weight:900}
        .googleRoutesLegend{position:absolute;left:12px;bottom:12px;z-index:4;width:min(340px,calc(100% - 24px));display:grid;gap:5px;padding:8px;border:1px solid rgba(0,0,0,.1);border-radius:12px;background:rgba(255,255,255,.96);box-shadow:0 8px 24px rgba(0,0,0,.1)}
        .routeLegendItem{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px;border-radius:9px}
        .routeLegendItem:hover{background:#f7f5f2}.routeLegendItem.error{opacity:.65}
        .routeLegendItem i{width:8px;height:32px;border-radius:999px}.routeLegendItem>div{min-width:0;display:grid;gap:2px}
        .routeLegendItem strong{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.routeLegendItem small{color:var(--muted);font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .routeConflict{color:#a33e34!important;font-weight:800}.routeTight{color:#8a6500!important;font-weight:800}
        .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:820px){.googleRoutesWrap,.googleRoutesCanvas{min-height:420px}.googleRoutesLegend{width:calc(100% - 24px)}}
      `}</style>
    </div>
  );
}
