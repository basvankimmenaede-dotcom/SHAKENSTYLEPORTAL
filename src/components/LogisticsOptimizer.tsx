'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Copy, Fuel, Map, Route, Truck, UserRound, X } from 'lucide-react';

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
  googleMapsConfigured: boolean;
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
  googleMapsConfigured,
}: Props) {
  const [approved, setApproved] = useState<string[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | 'all'>('all');

  const visibleOwners = useMemo(
    () => selectedOwnerId === 'all' ? owners : owners.filter((owner) => owner.id === selectedOwnerId),
    [selectedOwnerId, owners],
  );

  const approvedSuggestions = suggestions.filter((suggestion) => approved.includes(suggestion.id));
  const activeOwners = owners.filter((owner) => owner.stops.length > 0);
  const referenceDistance = activeOwners.reduce((sum, owner) => sum + owner.referenceDistanceKm, 0);
  const mapStops = visibleOwners.flatMap((owner) => owner.stops);

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
        <form className="datePicker" method="get">
          <input type="hidden" name="view" value={viewMode} />
          <label>
            <span>Dag</span>
            <input type="date" name="date" defaultValue={selectedDate} />
          </label>
          <button className="button orange" type="submit">Laden</button>
        </form>
      </header>

      <section className="weekBar" aria-label="Routekwaliteit komende zeven dagen">
        {days.map((day) => (
          <Link
            key={day.date}
            href={`/planning/logistics?date=${day.date}&view=${viewMode}`}
            className={`dayCard ${day.status} ${selectedDate === day.date ? 'selected' : ''}`}
          >
            <span className="dayStatusDot" />
            <div>
              <strong>{day.label}</strong>
              <small>{day.dateLabel}</small>
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
            <Truck size={15} /> Voertuig
          </Link>
          <Link href={viewHref('person')} className={viewMode === 'person' ? 'active' : ''}>
            <UserRound size={15} /> Persoon
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
          <span>Referentieafstand</span>
          <strong>{Math.round(referenceDistance)} <small>km</small></strong>
          <p>Rentman-retourafstanden opgeteld</p>
        </article>
        <article>
          <span>Voorstellen</span>
          <strong>{suggestions.length}</strong>
          <p>{approved.length} goedgekeurd</p>
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
                    <small>{owner.stops.length ? `${Math.round(owner.referenceDistanceKm)} km ref.` : 'Niet gepland'}</small>
                  </span>
                  {owner.fuelCardRequired ? <Fuel size={15} aria-label="Brandstofpas controleren" /> : null}
                </button>
              );
            })}
          </div>

          <div className="routeList">
            {visibleOwners.filter((owner) => owner.stops.length > 0).map((owner) => (
              <div className="routeGroup" key={owner.id}>
                <div className="routeTitle">
                  {viewMode === 'vehicle' ? <Truck size={16} /> : <UserRound size={16} />}
                  <strong>{owner.name}</strong>
                  <span>{owner.stops.length} stops</span>
                </div>
                {owner.stops.map((stop, stopIndex) => (
                  <div className="stopRow" key={`${owner.id}-${stop.id}-${stop.projectId}`}>
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

          {googleMapsConfigured ? (
            <div className="mapReady">
              <Map size={34} />
              <strong>Google Maps API-key is aanwezig</strong>
              <p>De kaartcomponent kan nu aan de Google Routes Library worden gekoppeld.</p>
            </div>
          ) : (
            <div className="mapPlaceholder">
              <div className="mapPlaceholderGrid" />
              <div className="mapMessage">
                <Map size={30} />
                <strong>Google Maps nog niet gekoppeld</strong>
                <p>De schematische kaart is verwijderd. Voeg een Google Maps Platform API-key toe om echte wegen, reistijden en routes te tonen.</p>
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
            Voor echte optimalisatie gebruiken we Google Routes + Route Matrix. Tot die koppeling actief is, zijn geel/rood gebaseerd op duidelijke Rentman-signalen zoals dubbele plaatsen, losse ritten en lange retourafstanden.
          </p>
          <p className="mapNote">Brandstofpasgrens: {fuelCardThresholdKm} km retour.</p>
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

      <style jsx>{`
        .logisticsPage{max-width:1540px;margin:0 auto;padding:30px 26px 64px;color:var(--ink)}
        .logisticsHeader{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:18px}
        .eyebrow,.panelHeader span,.actionHeader span{display:block;color:var(--orange-dark);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
        h1{margin:5px 0 7px;font-size:clamp(30px,4vw,48px);letter-spacing:-.045em}
        .logisticsHeader p,.actionHeader p{margin:0;color:var(--muted);max-width:820px}
        .datePicker{display:flex;align-items:flex-end;gap:8px}.datePicker label{display:grid;gap:5px}.datePicker label span{font-size:9px;font-weight:800;color:var(--muted)}
        .datePicker input{min-height:40px;border:1px solid var(--line);border-radius:10px;padding:8px 11px;background:#fff}
        .weekBar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:12px}
        .dayCard{min-width:0;display:grid;grid-template-columns:8px minmax(0,.7fr) minmax(0,1fr);gap:8px;align-items:center;padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:#fff}
        .dayCard.selected{box-shadow:0 0 0 2px #222 inset}.dayStatusDot{width:8px;height:34px;border-radius:999px;background:#cfcac2}
        .dayCard.green .dayStatusDot{background:#54a36c}.dayCard.yellow .dayStatusDot{background:#e7b63f}.dayCard.red .dayStatusDot{background:#d35d50}
        .dayCard>div{display:grid;gap:1px;min-width:0}.dayCard strong{font-size:10px;text-transform:capitalize}.dayCard small{font-size:8px;color:var(--muted)}
        .dayMeta{text-align:right}.dayMeta b{font-size:8px;white-space:nowrap}.dayMeta small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .viewSwitch{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:11px;background:#efede9}.viewSwitch a{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;color:var(--muted);font-size:10px;font-weight:900}.viewSwitch a.active{background:#fff;color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.08)}
        .legend{display:flex;gap:12px;flex-wrap:wrap}.legend span{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:8px;font-weight:800}.legend i{width:8px;height:8px;border-radius:50%}.legend .green{background:#54a36c}.legend .yellow{background:#e7b63f}.legend .red{background:#d35d50}
        .metricGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.metricGrid article{padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:#fff}.metricGrid article>span{font-size:9px;font-weight:800;color:var(--muted)}.metricGrid strong{display:block;margin-top:3px;font-size:23px}.metricGrid strong small{font-size:12px;color:var(--muted)}.metricGrid p{margin:2px 0 0;color:var(--muted);font-size:9px}
        .workspace{display:grid;grid-template-columns:minmax(310px,.82fr) minmax(420px,1.25fr) minmax(300px,.8fr);gap:12px;align-items:start}
        .ownerPanel,.mapPanel,.suggestionPanel,.actionPanel{border:1px solid var(--line);border-radius:16px;background:#fff;overflow:hidden}.panelHeader{min-height:56px;padding:11px 13px;border-bottom:1px solid var(--line);background:#fbfaf8;display:flex;align-items:center;justify-content:space-between;gap:12px}.panelHeader>div{display:grid;gap:2px}.panelHeader strong{font-size:12px}
        .filterChip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 9px;font-weight:800;font-size:9px;cursor:pointer}.filterChip.active{border-color:var(--orange);color:var(--orange-dark);background:var(--orange-soft)}
        .ownerList{display:grid;border-bottom:1px solid var(--line)}.ownerCard{width:100%;display:grid;grid-template-columns:7px minmax(0,1fr) auto auto;gap:9px;align-items:center;padding:10px 12px;border:0;border-bottom:1px solid #efede8;background:#fff;text-align:left;cursor:pointer}.ownerCard:last-child{border-bottom:0}.ownerCard:hover,.ownerCard.selected{background:#fff8f3}.ownerColor{width:7px;height:30px;border-radius:999px}.ownerMain,.ownerStats{display:grid;gap:1px;min-width:0}.ownerMain strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ownerMain small,.ownerStats small{font-size:8px;color:var(--muted)}.ownerStats{text-align:right}.ownerStats b{font-size:8px}
        .routeList{display:grid}.routeGroup{border-bottom:1px solid var(--line)}.routeGroup:last-child{border-bottom:0}.routeTitle{display:flex;align-items:center;gap:7px;padding:9px 11px;background:#f8f7f4;font-size:9px}.routeTitle span{margin-left:auto;color:var(--muted)}
        .stopRow{display:grid;grid-template-columns:23px minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 11px;border-top:1px solid #efede8}.stopNumber{width:21px;height:21px;display:grid;place-items:center;border-radius:50%;background:var(--orange-soft);color:var(--orange-dark);font-size:8px;font-weight:900}.stopRow>div{min-width:0;display:grid;gap:1px}.stopRow strong{font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stopRow span,.stopRow small{font-size:8px;color:var(--muted)}.stopRow>b{font-size:8px;color:var(--muted)}
        .mapPlaceholder,.mapReady{position:relative;min-height:480px;display:grid;place-items:center;background:#eef0ed;overflow:hidden}.mapPlaceholderGrid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.8) 1px,transparent 1px);background-size:42px 42px;transform:rotate(-9deg) scale(1.2);opacity:.7}.mapMessage{position:relative;z-index:2;width:min(360px,calc(100% - 40px));padding:20px;border:1px solid #d8d9d5;border-radius:14px;background:rgba(255,255,255,.94);text-align:center;box-shadow:0 12px 35px rgba(0,0,0,.08)}.mapMessage strong,.mapReady strong{display:block;margin-top:8px;font-size:14px}.mapMessage p,.mapReady p{margin:7px 0 0;color:var(--muted);font-size:9px;line-height:1.5}.mapStopList{position:absolute;left:12px;right:12px;bottom:12px;z-index:2;display:flex;flex-wrap:wrap;gap:5px}.mapStopList span{padding:5px 7px;border:1px solid rgba(0,0,0,.1);border-radius:999px;background:rgba(255,255,255,.94);font-size:8px}.mapNote{display:flex;gap:7px;align-items:flex-start;margin:0;padding:9px 12px;border-top:1px solid var(--line);color:var(--muted);font-size:8px;line-height:1.45}
        .suggestionList{display:grid}.suggestion{padding:12px;border-bottom:1px solid var(--line);display:grid;gap:7px}.suggestion:last-child{border-bottom:0}.suggestion.approved{background:#f6fbf7}.suggestionTop{display:flex;justify-content:space-between;align-items:center;gap:8px}.suggestionBadge{width:fit-content;padding:4px 7px;border-radius:999px;background:#f1efeb;color:#625e58;font-size:7px;font-weight:900;text-transform:uppercase}.suggestionBadge.vehicle-transfer{background:#fff0e6;color:#8b3b12}.suggestionBadge.tomorrow-nearby{background:#eef5fb;color:#2c607d}.suggestionBadge.fuel-card{background:#fff5cc;color:#715800}.approvedLabel{display:flex;align-items:center;gap:4px;color:#347043;font-size:8px;font-weight:900}.suggestion>strong{font-size:10px;line-height:1.35}.suggestion p{margin:0;color:var(--muted);font-size:8px;line-height:1.45}.checks{display:grid;gap:3px}.checks span{display:flex;gap:3px;color:#6a655f;font-size:8px}.approveButton{width:100%;border:1px solid var(--orange);border-radius:9px;background:var(--orange);color:#fff;padding:8px 10px;font-size:8px;font-weight:900;cursor:pointer}.textAction{width:fit-content;display:flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--muted);font-size:8px;font-weight:800;cursor:pointer;padding:2px 0}
        .actionPanel{margin-top:12px;padding:17px}.actionHeader{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}.actionHeader h2{margin:5px 0;font-size:21px}.actionHeader :global(.button){display:inline-flex;align-items:center;gap:7px}.actionHeader :global(.button:disabled){opacity:.45}.actionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.actionGrid article{padding:12px;border:1px solid #cfe0d2;border-radius:12px;background:#f8fcf9;display:grid;gap:6px}.actionGrid article>span{font-size:8px;font-weight:900;color:#347043}.actionGrid article>strong{font-size:10px}.actionGrid p{display:flex;gap:6px;margin:0;font-size:8px;color:#4e5c51}.emptyState,.emptyAction{padding:20px;color:var(--muted);font-size:9px;text-align:center}.emptyAction{margin-top:14px;border:1px dashed var(--line);border-radius:12px}
        @media(max-width:1250px){.weekBar{grid-template-columns:repeat(4,minmax(0,1fr))}.workspace{grid-template-columns:1fr 1.25fr}.suggestionPanel{grid-column:1/-1}.suggestionList{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:820px){.logisticsPage{padding:22px 14px 44px}.logisticsHeader,.actionHeader,.toolbar{align-items:stretch;flex-direction:column}.datePicker{align-items:stretch}.metricGrid{grid-template-columns:1fr 1fr}.weekBar{grid-template-columns:repeat(2,minmax(0,1fr))}.workspace{grid-template-columns:1fr}.suggestionPanel{grid-column:auto}.suggestionList{grid-template-columns:1fr}.actionGrid{grid-template-columns:1fr}.mapPlaceholder,.mapReady{min-height:380px}}
        @media(max-width:540px){.metricGrid{grid-template-columns:1fr}.weekBar{grid-template-columns:1fr 1fr}.dayCard{grid-template-columns:7px minmax(0,1fr)}.dayMeta{grid-column:2;text-align:left}.datePicker{display:grid;grid-template-columns:1fr auto}.ownerCard{grid-template-columns:7px minmax(0,1fr) auto}.ownerCard>svg{display:none}}
      `}</style>
    </main>
  );
}
