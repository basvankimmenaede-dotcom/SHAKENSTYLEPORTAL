/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, MapPinned, Route, Sparkles } from 'lucide-react';
import type { LogisticsOwner } from './LogisticsOptimizer';

const ROUTE_COLORS = ['#f37021', '#2f6f8f', '#6d5c9a', '#3f7f66', '#9a613e', '#6c737d'];

type RouteSummary = {
  id: number;
  name: string;
  color: string;
  distanceKm: number;
  durationMinutes: number;
  reordered: boolean;
  error?: string;
};

type Props = {
  apiKey: string;
  baseAddress: string;
  owners: LogisticsOwner[];
};

declare global {
  interface Window {
    google?: any;
    __snsGoogleMapsPromise?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (window.__snsGoogleMapsPromise) return window.__snsGoogleMapsPromise;

  window.__snsGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-sns-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps kon niet worden geladen.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.snsGoogleMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&language=nl&region=NL`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps kon niet worden geladen.'));
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

export default function GoogleRoutesMap({ apiKey, baseAddress, owners }: Props) {
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
        if (cancelled || !window.google?.maps?.importLibrary) return;

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
          const waypoints = owner.stops
            .map((stop) => stop.address || [stop.locationName, stop.city].filter(Boolean).join(', '))
            .filter(Boolean);

          if (!waypoints.length) continue;

          const color = ROUTE_COLORS[ownerIndex % ROUTE_COLORS.length];

          try {
            const request: any = {
              origin: baseAddress,
              destination: baseAddress,
              intermediates: waypoints.map((location) => ({ location })),
              travelMode: 'DRIVING',
              optimizeWaypointOrder: waypoints.length > 1,
              routingPreference: 'TRAFFIC_AWARE',
              fields: [
                'path',
                'legs',
                'distanceMeters',
                'durationMillis',
                'optimizedIntermediateWaypointIndices',
              ],
            };

            const response = await GoogleRoute.computeRoutes(request);
            const route = response?.routes?.[0];

            if (!route) {
              routeSummaries.push({
                id: owner.id,
                name: owner.name,
                color,
                distanceKm: 0,
                durationMinutes: 0,
                reordered: false,
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

            const optimized = Array.isArray(route.optimizedIntermediateWaypointIndices)
              ? route.optimizedIntermediateWaypointIndices
              : [];
            const reordered = optimized.length > 1 && optimized.some((value: number, index: number) => value !== index);

            routeSummaries.push({
              id: owner.id,
              name: owner.name,
              color,
              distanceKm: Number(route.distanceMeters || 0) / 1000,
              durationMinutes: Number(route.durationMillis || 0) / 60000,
              reordered,
            });
          } catch (routeError) {
            routeSummaries.push({
              id: owner.id,
              name: owner.name,
              color,
              distanceKm: 0,
              durationMinutes: 0,
              reordered: false,
              error: routeError instanceof Error ? routeError.message : 'Route kon niet worden berekend',
            });
          }
        }

        if (!cancelled) {
          if (!bounds.isEmpty()) map.fitBounds(bounds, 52);
          setSummaries(routeSummaries);
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
                    <small>
                      {Math.round(summary.distanceKm)} km · {formatDuration(summary.durationMinutes)}
                      {summary.reordered ? ' · betere volgorde gevonden' : ''}
                    </small>
                  )}
                </div>
                {summary.reordered ? <Sparkles size={14} aria-label="Betere volgorde gevonden" /> : null}
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
        .routeLegendItem{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 6px;border-radius:8px}
        .routeLegendItem:hover{background:#f7f5f2}.routeLegendItem.error{opacity:.65}
        .routeLegendItem i{width:8px;height:28px;border-radius:999px}.routeLegendItem>div{min-width:0;display:grid;gap:1px}
        .routeLegendItem strong{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.routeLegendItem small{color:var(--muted);font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:820px){.googleRoutesWrap,.googleRoutesCanvas{min-height:420px}.googleRoutesLegend{width:calc(100% - 24px)}}
      `}</style>
    </div>
  );
}
