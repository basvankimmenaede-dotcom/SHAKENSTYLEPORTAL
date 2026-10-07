'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Copy, Fuel, MapPin, Route, Truck, X } from 'lucide-react';

export type LogisticsStop = {
  id: number;
  projectId: number;
  projectNumber: string;
  projectName: string;
  vehicleId: number;
  vehicleName: string;
  licensePlate: string;
  functionName: string;
  groupName: string;
  start: string | null;
  end: string | null;
  locationName: string;
  address: string;
  city: string;
  warehouseDistanceKm: number | null;
};

export type LogisticsVehicle = {
  id: number;
  name: string;
  licensePlate: string;
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

type Props = {
  selectedDate: string;
  vehicles: LogisticsVehicle[];
  suggestions: LogisticsSuggestion[];
  fuelCardThresholdKm: number;
  unmappedStops: number;
};

const VEHICLE_COLORS = ['#e86d24', '#2f6f8f', '#6d5c9a', '#3f7f66', '#9a613e', '#6c737d'];

const CITY_POSITIONS: Record<string, [number, number]> = {
  boesingheliede: [183, 151],
  vijfhuizen: [181, 158],
  haarlem: [167, 149],
  amsterdam: [205, 143],
  laren: [238, 153],
  hilversum: [235, 169],
  utrecht: [245, 214],
  vianen: [247, 231],
  denhaag: [164, 231],
  'den haag': [164, 231],
  rotterdam: [189, 272],
  dordrecht: [222, 286],
  breda: [226, 335],
  eindhoven: [302, 352],
  arnhem: [326, 223],
  nijmegen: [330, 258],
  zwolle: [310, 126],
  groningen: [373, 61],
  leeuwarden: [292, 53],
  alkmaar: [180, 102],
  antwerpen: [204, 426],
  antwerp: [204, 426],
  beveren: [183, 415],
  'beveren-kruibeke-zwijndrecht': [184, 416],
  brussel: [235, 482],
  brussels: [235, 482],
  'groot-bijgaarden': [222, 477],
};

function normalizedCity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ');
}

function cityPosition(city: string) {
  const key = normalizedCity(city);
  if (CITY_POSITIONS[key]) return CITY_POSITIONS[key];
  if (key.includes('beveren')) return CITY_POSITIONS.beveren;
  if (key.includes('antwerpen')) return CITY_POSITIONS.antwerpen;
  if (key.includes('brussel')) return CITY_POSITIONS.brussel;
  return null;
}

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

function totalStops(vehicles: LogisticsVehicle[]) {
  return vehicles.reduce((sum, vehicle) => sum + vehicle.stops.length, 0);
}

export default function LogisticsOptimizer({
  selectedDate,
  vehicles,
  suggestions,
  fuelCardThresholdKm,
  unmappedStops,
}: Props) {
  const [approved, setApproved] = useState<string[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | 'all'>('all');

  const visibleVehicles = useMemo(
    () => selectedVehicleId === 'all' ? vehicles : vehicles.filter((vehicle) => vehicle.id === selectedVehicleId),
    [selectedVehicleId, vehicles],
  );

  const approvedSuggestions = suggestions.filter((suggestion) => approved.includes(suggestion.id));
  const activeVehicles = vehicles.filter((vehicle) => vehicle.stops.length > 0);
  const referenceDistance = activeVehicles.reduce((sum, vehicle) => sum + vehicle.referenceDistanceKm, 0);

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

  return (
    <main className="logisticsPage">
      <header className="logisticsHeader">
        <div>
          <span className="eyebrow">Planning</span>
          <h1>Logistieke optimalisatie</h1>
          <p>Vergelijk alle Rentman-voertuigen, zie overlappende ritten en maak een concrete actielijst voor Rentman.</p>
        </div>
        <form className="datePicker" method="get">
          <label>
            <span>Dag</span>
            <input type="date" name="date" defaultValue={selectedDate} />
          </label>
          <button className="button orange" type="submit">Laden</button>
        </form>
      </header>

      <section className="metricGrid" aria-label="Samenvatting logistiek">
        <article>
          <span>Voertuigen</span>
          <strong>{activeVehicles.length}<small> / {vehicles.length}</small></strong>
          <p>met een geplande rit</p>
        </article>
        <article>
          <span>Stops</span>
          <strong>{totalStops(vehicles)}</strong>
          <p>{formatDate(selectedDate)}</p>
        </article>
        <article>
          <span>Referentieafstand</span>
          <strong>{Math.round(referenceDistance)} <small>km</small></strong>
          <p>Rentman retourafstanden opgeteld</p>
        </article>
        <article>
          <span>Voorstellen</span>
          <strong>{suggestions.length}</strong>
          <p>{approved.length} goedgekeurd</p>
        </article>
      </section>

      <div className="workspace">
        <section className="vehiclePanel">
          <div className="panelHeader">
            <div>
              <span>Wagenpark</span>
              <strong>Alle voertuigen vergelijken</strong>
            </div>
            <button
              type="button"
              className={selectedVehicleId === 'all' ? 'filterChip active' : 'filterChip'}
              onClick={() => setSelectedVehicleId('all')}
            >
              Alles
            </button>
          </div>

          <div className="vehicleList">
            {vehicles.map((vehicle, index) => {
              const color = VEHICLE_COLORS[index % VEHICLE_COLORS.length];
              const isSelected = selectedVehicleId === vehicle.id;
              return (
                <button
                  type="button"
                  key={vehicle.id}
                  className={isSelected ? 'vehicleCard selected' : 'vehicleCard'}
                  onClick={() => setSelectedVehicleId(isSelected ? 'all' : vehicle.id)}
                >
                  <span className="vehicleColor" style={{ backgroundColor: color }} />
                  <span className="vehicleMain">
                    <strong>{vehicle.name}</strong>
                    <small>{vehicle.licensePlate || 'Geen kenteken'}</small>
                  </span>
                  <span className="vehicleStats">
                    <b>{vehicle.stops.length} stops</b>
                    <small>{vehicle.stops.length ? `${Math.round(vehicle.referenceDistanceKm)} km ref.` : 'Niet gepland'}</small>
                  </span>
                  {vehicle.fuelCardRequired ? <Fuel size={15} aria-label="Brandstofpas controleren" /> : null}
                </button>
              );
            })}
          </div>

          <div className="routeList">
            {visibleVehicles.filter((vehicle) => vehicle.stops.length > 0).map((vehicle) => (
              <div className="routeGroup" key={vehicle.id}>
                <div className="routeTitle">
                  <Truck size={16} />
                  <strong>{vehicle.name}</strong>
                  <span>{vehicle.stops.length} stops</span>
                </div>
                {vehicle.stops.map((stop, stopIndex) => (
                  <div className="stopRow" key={`${vehicle.id}-${stop.id}`}>
                    <span className="stopNumber">{stopIndex + 1}</span>
                    <div>
                      <strong>#{stop.projectNumber} · {stop.projectName}</strong>
                      <span>{formatTime(stop.start)} · {stop.city || stop.locationName}</span>
                      <small>{stop.groupName !== '—' ? `${stop.groupName} · ` : ''}{stop.functionName}</small>
                    </div>
                    {stop.warehouseDistanceKm !== null ? <b>{Math.round(stop.warehouseDistanceKm)} km</b> : null}
                  </div>
                ))}
              </div>
            ))}
            {!activeVehicles.length ? <div className="emptyState">Geen voertuigplanning gevonden voor deze dag.</div> : null}
          </div>
        </section>

        <section className="mapPanel" aria-label="Schematische kaart van routes">
          <div className="panelHeader">
            <div>
              <span>Kaart</span>
              <strong>Voertuigen & stops</strong>
            </div>
            <small>Schematisch · geen navigatiekaart</small>
          </div>

          <div className="mapCanvas">
            <svg viewBox="0 0 520 560" role="img" aria-label="Schematische kaart van Nederland en België met voertuigstops">
              <path className="countryShape nl" d="M126 38 L235 28 L321 62 L366 113 L351 171 L382 214 L349 270 L314 310 L269 349 L218 335 L181 298 L151 258 L139 211 L112 164 L119 112 Z" />
              <path className="countryShape be" d="M143 355 L219 337 L292 355 L337 392 L319 456 L272 503 L206 514 L151 479 L126 423 Z" />
              <text className="countryLabel" x="270" y="185">NEDERLAND</text>
              <text className="countryLabel" x="229" y="435">BELGIË</text>

              {visibleVehicles.map((vehicle, index) => {
                const points = vehicle.stops
                  .map((stop) => cityPosition(stop.city))
                  .filter((point): point is [number, number] => Boolean(point));
                if (!points.length) return null;
                const color = VEHICLE_COLORS[vehicles.findIndex((item) => item.id === vehicle.id) % VEHICLE_COLORS.length];
                const warehouse: [number, number] = CITY_POSITIONS.boesingheliede;
                const routePoints = [warehouse, ...points, warehouse].map((point) => point.join(',')).join(' ');
                return <polyline key={vehicle.id} points={routePoints} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" opacity=".82" />;
              })}

              <g>
                <circle cx={CITY_POSITIONS.boesingheliede[0]} cy={CITY_POSITIONS.boesingheliede[1]} r="9" className="warehouseMarker" />
                <text x={CITY_POSITIONS.boesingheliede[0] + 13} y={CITY_POSITIONS.boesingheliede[1] + 4} className="markerLabel">SNS</text>
              </g>

              {visibleVehicles.flatMap((vehicle) => vehicle.stops.map((stop, stopIndex) => {
                const point = cityPosition(stop.city);
                if (!point) return null;
                const vehicleIndex = vehicles.findIndex((item) => item.id === vehicle.id);
                const color = VEHICLE_COLORS[vehicleIndex % VEHICLE_COLORS.length];
                return (
                  <g key={`marker-${vehicle.id}-${stop.id}`}>
                    <circle cx={point[0]} cy={point[1]} r="10" fill={color} stroke="#fff" strokeWidth="3" />
                    <text x={point[0]} y={point[1] + 4} className="markerNumber">{stopIndex + 1}</text>
                    <text x={point[0] + 14} y={point[1] - 8} className="markerLabel">{stop.city}</text>
                  </g>
                );
              }))}
            </svg>

            <div className="mapLegend">
              {activeVehicles.map((vehicle, index) => (
                <span key={vehicle.id}>
                  <i style={{ backgroundColor: VEHICLE_COLORS[index % VEHICLE_COLORS.length] }} />
                  {vehicle.name}
                </span>
              ))}
            </div>
          </div>

          {unmappedStops > 0 ? (
            <p className="mapNote"><AlertTriangle size={14} /> {unmappedStops} stop(s) konden nog niet op de schematische kaart worden geplaatst.</p>
          ) : null}
          <p className="mapNote">De kaart toont de volgorde en spreiding. Voor echte rijtijd, routekilometers, tol en parkeren koppelen we later een routeprovider.</p>
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
            {!suggestions.length ? <div className="emptyState">Geen opvallende combinaties gevonden met de huidige regels.</div> : null}
          </div>
        </aside>
      </div>

      <section className="actionPanel">
        <div className="actionHeader">
          <div>
            <span>Handmatig doorvoeren</span>
            <h2>Rentman-actielijst</h2>
            <p>De portal wijzigt Rentman niet. Na goedkeuren staat hier exact wat je handmatig moet aanpassen.</p>
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
          <div className="emptyAction">Keur een voorstel goed om de concrete Rentman-aanpassing hier te tonen.</div>
        )}
      </section>

      <style jsx>{`
        .logisticsPage{max-width:1500px;margin:0 auto;padding:34px 28px 64px;color:var(--ink)}
        .logisticsHeader{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:22px}
        .eyebrow,.panelHeader span,.actionHeader span{display:block;color:var(--orange-dark);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
        h1{margin:6px 0 7px;font-size:clamp(30px,4vw,48px);letter-spacing:-.045em}
        .logisticsHeader p,.actionHeader p{margin:0;color:var(--muted);max-width:760px}
        .datePicker{display:flex;align-items:flex-end;gap:8px}
        .datePicker label{display:grid;gap:5px}
        .datePicker label span{font-size:10px;font-weight:800;color:var(--muted)}
        .datePicker input{min-height:42px;border:1px solid var(--line);border-radius:10px;padding:8px 11px;background:#fff;font:inherit}
        .metricGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
        .metricGrid article{padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:#fff}
        .metricGrid article>span{font-size:10px;font-weight:800;color:var(--muted)}
        .metricGrid strong{display:block;margin-top:4px;font-size:25px;letter-spacing:-.04em}
        .metricGrid strong small{font-size:13px;color:var(--muted)}
        .metricGrid p{margin:3px 0 0;color:var(--muted);font-size:10px}
        .workspace{display:grid;grid-template-columns:minmax(310px,.85fr) minmax(420px,1.25fr) minmax(300px,.8fr);gap:14px;align-items:start}
        .vehiclePanel,.mapPanel,.suggestionPanel,.actionPanel{border:1px solid var(--line);border-radius:16px;background:#fff;overflow:hidden}
        .panelHeader{min-height:60px;padding:12px 14px;border-bottom:1px solid var(--line);background:#fbfaf8;display:flex;align-items:center;justify-content:space-between;gap:12px}
        .panelHeader>div{display:grid;gap:3px}
        .panelHeader strong{font-size:13px}
        .panelHeader small{font-size:9px;color:var(--muted)}
        .filterChip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;font-weight:800;font-size:10px;cursor:pointer}
        .filterChip.active{border-color:var(--orange);color:var(--orange-dark);background:var(--orange-soft)}
        .vehicleList{display:grid;border-bottom:1px solid var(--line)}
        .vehicleCard{width:100%;display:grid;grid-template-columns:7px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:11px 13px;border:0;border-bottom:1px solid #efede8;background:#fff;text-align:left;cursor:pointer}
        .vehicleCard:last-child{border-bottom:0}.vehicleCard:hover,.vehicleCard.selected{background:#fff8f3}
        .vehicleColor{width:7px;height:32px;border-radius:999px}
        .vehicleMain,.vehicleStats{display:grid;gap:2px;min-width:0}.vehicleMain strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vehicleMain small,.vehicleStats small{font-size:9px;color:var(--muted)}.vehicleStats{text-align:right}.vehicleStats b{font-size:9px}
        .routeList{display:grid}.routeGroup{border-bottom:1px solid var(--line)}.routeGroup:last-child{border-bottom:0}
        .routeTitle{display:flex;align-items:center;gap:7px;padding:10px 12px;background:#f8f7f4;font-size:10px}.routeTitle span{margin-left:auto;color:var(--muted)}
        .stopRow{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid #efede8}
        .stopNumber{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:var(--orange-soft);color:var(--orange-dark);font-size:9px;font-weight:900}
        .stopRow>div{min-width:0;display:grid;gap:2px}.stopRow strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stopRow span,.stopRow small{font-size:8px;color:var(--muted)}.stopRow>b{font-size:9px;color:var(--muted)}
        .mapCanvas{position:relative;min-height:560px;background:linear-gradient(#f6f5f1,#eeece6);overflow:hidden}
        svg{display:block;width:100%;height:560px}.countryShape{fill:#fff;stroke:#d6d2ca;stroke-width:2}.countryShape.be{fill:#faf9f6}.countryLabel{font-size:15px;font-weight:900;letter-spacing:.16em;fill:#d1cdc5}
        .warehouseMarker{fill:#242424;stroke:#fff;stroke-width:3}.markerNumber{fill:#fff;font-size:8px;font-weight:900;text-anchor:middle}.markerLabel{fill:#494641;font-size:9px;font-weight:800}
        .mapLegend{position:absolute;left:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:6px;max-width:calc(100% - 24px);padding:8px 9px;border:1px solid rgba(0,0,0,.08);border-radius:10px;background:rgba(255,255,255,.92);box-shadow:0 6px 24px rgba(0,0,0,.08)}
        .mapLegend span{display:flex;align-items:center;gap:5px;font-size:8px;font-weight:800}.mapLegend i{width:8px;height:8px;border-radius:50%}
        .mapNote{display:flex;gap:7px;align-items:flex-start;margin:0;padding:9px 13px;border-top:1px solid var(--line);color:var(--muted);font-size:9px;line-height:1.4}
        .suggestionList{display:grid}.suggestion{padding:13px;border-bottom:1px solid var(--line);display:grid;gap:8px}.suggestion:last-child{border-bottom:0}.suggestion.approved{background:#f6fbf7}
        .suggestionTop{display:flex;justify-content:space-between;align-items:center;gap:8px}.suggestionBadge{width:fit-content;padding:4px 7px;border-radius:999px;background:#f1efeb;color:#625e58;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
        .suggestionBadge.vehicle-transfer{background:#fff0e6;color:#8b3b12}.suggestionBadge.tomorrow-nearby{background:#eef5fb;color:#2c607d}.suggestionBadge.fuel-card{background:#fff5cc;color:#715800}
        .approvedLabel{display:flex;align-items:center;gap:4px;color:#347043;font-size:8px;font-weight:900}.suggestion>strong{font-size:11px;line-height:1.35}.suggestion p{margin:0;color:var(--muted);font-size:9px;line-height:1.45}
        .checks{display:grid;gap:4px}.checks span{display:flex;gap:3px;align-items:flex-start;color:#6a655f;font-size:8px}
        .approveButton{width:100%;border:1px solid var(--orange);border-radius:9px;background:var(--orange);color:#fff;padding:8px 10px;font:inherit;font-size:9px;font-weight:900;cursor:pointer}
        .textAction{width:fit-content;display:flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--muted);font-size:8px;font-weight:800;cursor:pointer;padding:2px 0}
        .actionPanel{margin-top:14px;padding:18px}.actionHeader{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.actionHeader h2{margin:5px 0 5px;font-size:22px}
        .actionHeader :global(.button){display:inline-flex;align-items:center;gap:7px}.actionHeader :global(.button:disabled){opacity:.45;cursor:not-allowed}
        .actionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:15px}.actionGrid article{padding:13px;border:1px solid #cfe0d2;border-radius:12px;background:#f8fcf9;display:grid;gap:7px}
        .actionGrid article>span{font-size:8px;font-weight:900;color:#347043}.actionGrid article>strong{font-size:11px}.actionGrid p{display:flex;align-items:flex-start;gap:6px;margin:0;font-size:9px;color:#4e5c51}
        .emptyState,.emptyAction{padding:22px;color:var(--muted);font-size:10px;text-align:center}.emptyAction{margin-top:14px;border:1px dashed var(--line);border-radius:12px}
        @media(max-width:1180px){.workspace{grid-template-columns:1fr 1.3fr}.suggestionPanel{grid-column:1/-1}.suggestionList{grid-template-columns:repeat(2,minmax(0,1fr))}.suggestion{border-right:1px solid var(--line)}}
        @media(max-width:820px){.logisticsPage{padding:22px 14px 44px}.logisticsHeader,.actionHeader{align-items:stretch;flex-direction:column}.datePicker{align-items:stretch}.datePicker label{flex:1}.metricGrid{grid-template-columns:1fr 1fr}.workspace{grid-template-columns:1fr}.suggestionPanel{grid-column:auto}.suggestionList{grid-template-columns:1fr}.mapCanvas,svg{min-height:470px;height:470px}.actionGrid{grid-template-columns:1fr}}
        @media(max-width:540px){.metricGrid{grid-template-columns:1fr}.datePicker{display:grid;grid-template-columns:1fr auto}.vehicleCard{grid-template-columns:7px minmax(0,1fr) auto}.vehicleCard>svg{display:none}.mapCanvas,svg{min-height:410px;height:410px}}
      `}</style>
    </main>
  );
}
