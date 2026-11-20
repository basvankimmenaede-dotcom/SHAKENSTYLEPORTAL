'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize, Pause, Play, SkipForward, X, AlertCircle } from 'lucide-react';
import { addCalendarDays, amsterdamDateKey, amsterdamDayStart, buildTvAgendaWindow, type TvAgendaProject, type TvAgendaSnapshot } from '@/lib/planning-tv';
import { cursorForPage, paginateTvDays, reconcileTvCursor, type TvCursor, type TvDetailItem } from '@/lib/planning-tv-display';
import styles from './PlanningTvDashboard.module.css';

const ROTATE_MS = 20_000;
const REFRESH_MS = 30_000;
const TIME_ZONE = 'Europe/Amsterdam';
const dateFormat = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFormat = new Intl.DateTimeFormat('nl-NL', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const monthFormat = new Intl.DateTimeFormat('nl-NL', { month: 'short', timeZone: TIME_ZONE });
const weekdays = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function dateAtNoon(key: string) { return new Date(`${key}T12:00:00Z`); }
function overlaps(start: string, end: string, day: string) {
  return Date.parse(start) < amsterdamDayStart(addCalendarDays(day, 1)) && Date.parse(end) > amsterdamDayStart(day);
}
function splitName(name: string, limit: number) {
  const pieces: string[] = [];
  let rest = name.trim() || 'Projectnaam ontbreekt';
  while (rest.length > limit) {
    const space = rest.lastIndexOf(' ', limit);
    const cut = space > limit / 2 ? space : limit;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  pieces.push(rest);
  return pieces;
}

function ProjectCard({ item, project, today, active = false }: { item: TvDetailItem; project: TvAgendaProject; today: string; active?: boolean }) {
  const period = project.periods[item.periodIndex];
  const started = Date.parse(period.start) < amsterdamDayStart(today);
  const multiDay = amsterdamDateKey(new Date(period.start)) !== amsterdamDateKey(new Date(Date.parse(period.end) - 1));
  return <article className={`${styles.projectCard} ${active ? styles.activeCard : ''}`} data-project-id={project.id}>
    <div className={styles.cardMeta}><strong>{project.number ? `#${project.number}` : 'Projectnummer ontbreekt'}</strong><span>{started ? 'Loopt al' : multiDay ? 'Meerdaags' : 'Eén dag'}</span></div>
    <h3>{item.namePart}</h3>
    {item.namePartCount > 1 && <div className={styles.continuation}>Projectnaam · deel {item.namePartIndex + 1} van {item.namePartCount}</div>}
    <div className={styles.period}>
      <div><span>Begin gebruik</span><strong>{dateFormat.format(new Date(period.start))}</strong><b>{timeFormat.format(new Date(period.start))}</b></div>
      <div><span>Einde gebruik</span><strong>{dateFormat.format(new Date(period.end))}</strong><b>{timeFormat.format(new Date(period.end))}</b></div>
    </div>
    {project.periods.length > 1 && <div className={styles.multiplePeriods}>Gebruiksperiode {item.periodIndex + 1} van {project.periods.length} · controleer subprojecten</div>}
  </article>;
}

export default function PlanningTvDashboard({ initialSnapshot, initialError = null }: { initialSnapshot: TvAgendaSnapshot | null; initialError?: string | null }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState(initialError);
  const [accessError, setAccessError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cursor, setCursor] = useState<TvCursor | null>(null);
  const [paused, setPaused] = useState(false);
  const [cycleStartedAt, setCycleStartedAt] = useState(() => Date.now());
  const [fullScreen, setFullScreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showIssues, setShowIssues] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [nameLimit, setNameLimit] = useState(180);
  const [screenMessage, setScreenMessage] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ height: 650, width: 700, gap: 14 });
  const [heights, setHeights] = useState<Record<string, number>>({});
  const detailBody = useRef<HTMLDivElement>(null);
  const measurement = useRef<HTMLDivElement>(null);
  const controlTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = amsterdamDateKey(new Date(now));
  const endDay = addCalendarDays(today, 29);
  const emptySnapshot = useMemo<TvAgendaSnapshot>(() => ({ fetchedAt: '', projects: [], issues: [] }), []);
  const agenda = useMemo(() => buildTvAgendaWindow(snapshot ?? emptySnapshot, today), [snapshot, emptySnapshot, today]);
  const projectsById = useMemo(() => new Map(agenda.projects.map(project => [project.id, project])), [agenda.projects]);

  // Fragments retain the main project ID; presentation pagination never changes counts.
  const { itemsByDay, uniqueItems } = useMemo(() => {
    const byDay: Record<string, TvDetailItem[]> = {};
    const unique = new Map<string, TvDetailItem>();
    for (const day of agenda.days) {
      byDay[day.date] = [];
      for (const id of day.projectIds) {
        const project = projectsById.get(id)!;
        const nameParts = splitName(project.name, nameLimit);
        project.periods.forEach((period, periodIndex) => {
          if (!overlaps(period.start, period.end, day.date)) return;
          nameParts.forEach((namePart, namePartIndex) => {
            const item = { key: `${id}:${periodIndex}:${namePartIndex}`, projectId: id, periodIndex, namePart, namePartIndex, namePartCount: nameParts.length };
            byDay[day.date].push(item);
            unique.set(item.key, item);
          });
        });
      }
    }
    return { itemsByDay: byDay, uniqueItems: [...unique.values()] };
  }, [agenda.days, projectsById, nameLimit]);
  const pages = useMemo(() => paginateTvDays(agenda.days, itemsByDay, heights, dimensions.height, dimensions.gap), [agenda.days, itemsByDay, heights, dimensions.height, dimensions.gap]);
  const currentIndex = Math.max(0, reconcileTvCursor(pages, cursor));
  const currentPage = pages[currentIndex];
  const activeDay = currentPage?.day ?? today;
  const rotationState = useRef({ pages, currentIndex });
  rotationState.current = { pages, currentIndex };
  const highlightedIndex = paused ? 0 : Math.min((currentPage?.items.length ?? 1) - 1, Math.floor(Math.max(0, now - cycleStartedAt) / (ROTATE_MS / Math.max(1, currentPage?.items.length ?? 1))));
  const highlightedProject = projectsById.get(currentPage?.items[highlightedIndex]?.projectId);

  const goNext = useCallback(() => {
    const state = rotationState.current;
    if (state.pages.length) setCursor(cursorForPage(state.pages[(state.currentIndex + 1) % state.pages.length]));
    setCycleStartedAt(Date.now());
  }, []);

  useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(clock); }, []);
  useEffect(() => {
    if (paused || accessError || showIssues || !pageVisible) return;
    const timer = setTimeout(goNext, ROTATE_MS);
    return () => clearTimeout(timer);
    // Data refresh deliberately does not restart the reading timer.
  }, [cycleStartedAt, paused, accessError, showIssues, pageVisible, goNext]);
  const lastDay = useRef(today);
  useEffect(() => { if (today !== lastDay.current) { lastDay.current = today; setCursor(null); setCycleStartedAt(Date.now()); } }, [today]);

  useEffect(() => {
    let disposed = false;
    let running = false;
    let controller: AbortController | null = null;
    let noAccess = false;
    async function refresh() {
      if (running || noAccess || disposed) return;
      running = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 25_000);
      try {
        const response = await fetch('/api/planning/tv', { cache: 'no-store', signal: controller.signal, credentials: 'same-origin' });
        if (response.status === 401 || response.status === 403 || response.redirected) {
          noAccess = true;
          if (!disposed) { setAccessError(true); setError(response.status === 403 ? 'Je account heeft geen toegang meer tot de planning.' : 'Je sessie is verlopen. Log opnieuw in om de agenda bij te werken.'); }
          return;
        }
        if (!response.ok) throw new Error('refresh');
        const incoming: TvAgendaSnapshot = await response.json();
        if (!incoming || !Array.isArray(incoming.projects) || !Array.isArray(incoming.issues) || !Number.isFinite(Date.parse(incoming.fetchedAt))) throw new Error('snapshot');
        if (!disposed) {
          setSnapshot(previous => previous && Date.parse(previous.fetchedAt) > Date.parse(incoming.fetchedAt) ? previous : incoming);
          setError(null);
          setAccessError(false);
        }
      } catch {
        if (!disposed) setError('Rentman is tijdelijk niet bereikbaar. De laatst opgehaalde gegevens blijven zichtbaar.');
      } finally { clearTimeout(timeout); running = false; }
    }
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, REFRESH_MS);
    const onVisible = () => { setPageVisible(!document.hidden); if (!document.hidden) { setNow(Date.now()); setCycleStartedAt(Date.now()); void refresh(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [today]);

  useEffect(() => {
    const element = detailBody.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { const style = getComputedStyle(element); setDimensions({ height: element.clientHeight, width: element.clientWidth, gap: parseFloat(style.rowGap) || 14 }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setNameLimit(dimensions.height < 400 ? 100 : 180); }, [dimensions.height, dimensions.width]);
  useEffect(() => {
    let disposed = false;
    const measure = () => {
      if (disposed || !measurement.current) return;
      const next: Record<string, number> = {};
      measurement.current.querySelectorAll<HTMLElement>('[data-measure-key]').forEach(element => { next[element.dataset.measureKey!] = Math.ceil(element.getBoundingClientRect().height); });
      setHeights(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      // Exceptionally long names get readable continuation cards, never clipping.
      if (uniqueItems.some(item => next[item.key] > dimensions.height && item.namePart.length > 24)) {
        setNameLimit(limit => Math.max(24, Math.floor(limit * .7)));
      }
    };
    const frame = requestAnimationFrame(measure);
    void document.fonts.ready.then(measure);
    return () => { disposed = true; cancelAnimationFrame(frame); };
  }, [uniqueItems, dimensions.width, dimensions.height, today]);
  useEffect(() => { const update = () => setFullScreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', update); return () => document.removeEventListener('fullscreenchange', update); }, []);
  const revealControls = useCallback(() => { setControlsVisible(true); if (controlTimeout.current) clearTimeout(controlTimeout.current); controlTimeout.current = setTimeout(() => setControlsVisible(false), 5000); }, []);
  useEffect(() => { revealControls(); return () => { if (controlTimeout.current) clearTimeout(controlTimeout.current); }; }, [revealControls]);
  async function toggleFullScreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setScreenMessage(null); }
    catch { setScreenMessage('Gebruik de schermvullende stand van de browser (F11).'); }
  }

  const age = snapshot ? now - Date.parse(snapshot.fetchedAt) : Infinity;
  const stale = age > 120_000;
  const firstWeekday = (dateAtNoon(today).getUTCDay() + 6) % 7;
  const rowCount = Math.ceil((firstWeekday + 30) / 7);
  const activeDayIds = agenda.days.find(day => day.date === activeDay)?.projectIds ?? [];
  const shownOrdinals = [...new Set((currentPage?.items ?? []).map(item => activeDayIds.indexOf(item.projectId) + 1))];
  const relevantIssues = (snapshot?.issues ?? []).filter(issue => !issue.periods?.length || issue.periods.some(period => Date.parse(period.start) < amsterdamDayStart(addCalendarDays(today, 30)) && Date.parse(period.end) > amsterdamDayStart(today)));
  const undatedCount = relevantIssues.filter(issue => issue.kind === 'missing_usage').length;
  const footerStatus = accessError ? 'Opnieuw inloggen nodig' : error ? 'Verbinding onderbroken' : stale ? 'Gegevens niet actueel' : 'Automatisch bijgewerkt';

  return <main className={styles.screen} onMouseMove={revealControls} onPointerDown={revealControls} onKeyDown={revealControls}>
    <header className={styles.header}>
      <div className={styles.brandBlock}><div className={styles.brand}>SHAKEN<span>STYLE</span></div><h1>Agenda<span>30 dagen</span></h1></div>
      <div className={styles.range}>{shortDateFormat.format(dateAtNoon(today))}<span>t/m</span>{shortDateFormat.format(dateAtNoon(endDay))}<small>{dateAtNoon(today).getUTCFullYear() === dateAtNoon(endDay).getUTCFullYear() ? dateAtNoon(today).getUTCFullYear() : `${dateAtNoon(today).getUTCFullYear()} / ${dateAtNoon(endDay).getUTCFullYear()}`}</small></div>
      <div className={styles.total}><strong data-testid="unique-total">{snapshot ? agenda.total : '—'}</strong><div>{agenda.total === 1 ? 'unieke klus' : 'unieke klussen'}<small>in deze 30 dagen</small></div></div>
      <div className={styles.clock}><strong suppressHydrationWarning>{timeFormat.format(new Date(now))}</strong><span>Europe/Amsterdam</span></div>
    </header>

    <div className={styles.layout}>
      <section className={styles.calendar} aria-label="Dertig kalenderdagen">
        <div className={styles.calendarHeading}><h2>De komende 30 dagen</h2><span><i /> Vandaag</span></div>
        <div className={styles.weekdays}>{weekdays.map((day, index) => <span key={day} className={index > 4 ? styles.weekendHeading : ''}>{day}</span>)}</div>
        <div className={`${styles.calendarGrid} ${rowCount === 6 ? styles.sixRows : ''}`} style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}>
          {Array.from({ length: firstWeekday }, (_, i) => <div key={`before-${i}`} className={styles.blankDay} />)}
          {agenda.days.map(day => {
            const isToday = day.date === today;
            const weekend = [0, 6].includes(dateAtNoon(day.date).getUTCDay());
            const highlight = highlightedProject?.periods.some(period => overlaps(period.start, period.end, day.date));
            return <button key={day.date} data-calendar-date={day.date} className={`${styles.day} ${weekend ? styles.weekend : ''} ${isToday ? styles.today : ''} ${activeDay === day.date ? styles.selectedDay : ''} ${highlight ? styles.highlightedDay : ''}`} aria-label={`${dayFormat.format(dateAtNoon(day.date))}: ${snapshot ? day.projectIds.length : 'onbekend'} klussen${isToday ? ', vandaag' : ''}`} aria-pressed={activeDay === day.date} onClick={() => { const page = pages.find(value => value.day === day.date); if (page) { setCursor(cursorForPage(page)); setCycleStartedAt(Date.now()); } }}>
              <span className={styles.dayDate}>{dateAtNoon(day.date).getUTCDate()}<small>{monthFormat.format(dateAtNoon(day.date)).replace('.', '')}</small></span>
              <strong>{snapshot ? day.projectIds.length : '—'}</strong><span className={styles.dayLabel}>{isToday ? 'VANDAAG' : day.projectIds.length === 1 ? 'klus' : 'klussen'}</span><span className={styles.periodIndicator} />
            </button>;
          })}
          {Array.from({ length: rowCount * 7 - 30 - firstWeekday }, (_, i) => <div key={`after-${i}`} className={styles.blankDay} />)}
        </div>
        <div className={styles.calendarLegend}><span><i /> Oranje lijn: gebruiksperiode van de uitgelichte klus</span><span>{agenda.days.filter(day => day.projectIds.length).length} dagen met klussen</span></div>
      </section>

      <section className={styles.details} aria-label="Automatisch wisselende projectdetails">
        <div className={styles.detailHeading}><div><span>{activeDay === today ? 'VANDAAG' : 'DAGDETAILS'}</span><h2>{dayFormat.format(dateAtNoon(activeDay))}</h2></div><strong>{snapshot ? activeDayIds.length : '—'}<small>{activeDayIds.length === 1 ? 'klus' : 'klussen'}</small></strong></div>
        <div className={styles.detailBody} ref={detailBody}>
          {currentPage?.items.map((item, index) => <ProjectCard key={item.key} item={item} project={projectsById.get(item.projectId)!} today={today} active={index === highlightedIndex} />)}
          {!currentPage?.items.length && <div className={styles.emptyState}><span>{!snapshot ? 'Even geduld' : 'Ruimte in de agenda'}</span><h3>{!snapshot ? 'Agenda wordt geladen' : `Geen klussen ${activeDay === today ? 'vandaag' : 'op deze dag'}`}</h3><p>{!snapshot ? 'We halen de gebruiksperioden op uit Rentman.' : agenda.total ? 'De volgende geplande dag verschijnt automatisch.' : 'Er zijn geen klussen met een geselecteerde status en een geldige gebruiksperiode in deze 30 dagen.'}</p></div>}
          <div ref={measurement} className={styles.measurement} aria-hidden="true">{uniqueItems.map(item => <div key={item.key} data-measure-key={item.key}><ProjectCard item={item} project={projectsById.get(item.projectId)!} today={today} /></div>)}</div>
        </div>
        <div className={styles.detailFooter}><div><strong>{shownOrdinals.length ? `Klus${shownOrdinals.length > 1 ? 'sen' : ''} ${Math.min(...shownOrdinals)}${shownOrdinals.length > 1 ? `–${Math.max(...shownOrdinals)}` : ''} van ${activeDayIds.length}` : 'Dagoverzicht'}{currentPage && currentPage.pageCount > 1 ? ` · Deel ${currentPage.pageIndex + 1} van ${currentPage.pageCount}` : ''}</strong><span>{paused ? 'Rotatie gepauzeerd' : `Wisselt automatisch · ${pages.length * ROTATE_MS / 1000 >= 60 ? `${Math.ceil(pages.length * ROTATE_MS / 60_000)} min` : '20 sec'} per ronde`}</span></div><div className={styles.progressTrack}><div style={{ transform: `scaleX(${paused || showIssues ? 0 : Math.min(1, Math.max(0, now - cycleStartedAt) / ROTATE_MS)})` }} /></div></div>
      </section>
    </div>

    <footer className={styles.footer}>
      <div className={error || stale ? styles.statusWarning : styles.sourceStatus}><i /><strong>{footerStatus}</strong>{snapshot && <span>Rentman · bijgewerkt {shortDateFormat.format(new Date(snapshot.fetchedAt))} om {timeFormat.format(new Date(snapshot.fetchedAt))}</span>}</div>
      {relevantIssues.length ? <button className={styles.issuesButton} onClick={() => { setShowIssues(true); revealControls(); }}><AlertCircle size={18} />{undatedCount ? `${undatedCount} zonder gebruiksperiode` : `${relevantIssues.length} te controleren`}{relevantIssues.length > undatedCount && undatedCount > 0 ? ` · ${relevantIssues.length - undatedCount} overige controles` : ''}</button> : <span className={styles.sourceNote}>Gebruiksperioden uit Rentman · elk project één keer geteld</span>}
    </footer>
    {(error || stale) && <div className={styles.connectionNotice} role="status">{error || 'Rentman is langer dan twee minuten niet succesvol bijgewerkt. De getoonde gegevens kunnen verouderd zijn.'}{accessError && <a href="/login">Opnieuw inloggen</a>}</div>}
    <nav className={`${styles.controls} ${controlsVisible ? styles.controlsVisible : ''}`} aria-label="TV bediening">
      <a href="/planning">Terug naar planning</a>
      <button onClick={() => { setPaused(value => !value); setCycleStartedAt(Date.now()); }} aria-label={paused ? 'Automatische rotatie hervatten' : 'Automatische rotatie pauzeren'}>{paused ? <Play size={19} /> : <Pause size={19} />}{paused ? 'Hervatten' : 'Pauze'}</button>
      <button onClick={goNext}><SkipForward size={19} />Volgende</button><button onClick={() => void toggleFullScreen()}>{fullScreen ? <Minimize size={19} /> : <Maximize size={19} />}{fullScreen ? 'Verkleinen' : 'Schermvullend'}</button>
    </nav>
    {screenMessage && <div className={styles.screenMessage} role="status">{screenMessage}</div>}
    {showIssues && <div className={styles.modalBackdrop} onClick={() => { setShowIssues(false); setCycleStartedAt(Date.now()); }}><section className={styles.issuesDialog} role="dialog" aria-modal="true" aria-labelledby="tv-issues-title" onClick={event => event.stopPropagation()}><button autoFocus className={styles.closeIssues} aria-label="Datacontrole sluiten" onClick={() => { setShowIssues(false); setCycleStartedAt(Date.now()); }}><X /></button><h2 id="tv-issues-title">Controle van de gebruiksperioden</h2><p>Projecten zonder geldige gebruiksperiode of herkenbare planningstatus worden niet meegeteld. Zonder datum is niet te bepalen of ze binnen deze 30 dagen vallen; dit kunnen ook oudere projecten zijn.</p><p>Bij meerdere gebruiksperioden tellen de geselecteerde subprojecten samen als één klus. Controleer in Rentman of de gebruiksperioden het evenement beschrijven. Er wordt niet op basis van subprojectnamen gegokt welk deel transport of opbouw is.</p><ul>{relevantIssues.map((issue, index) => <li key={`${issue.projectId}:${issue.kind}:${index}`}><strong>{issue.number ? `#${issue.number} · ` : ''}{issue.name}</strong><p>{issue.reason}</p></li>)}</ul><button className={styles.dialogDone} onClick={() => { setShowIssues(false); setCycleStartedAt(Date.now()); }}>Terug naar de TV agenda</button></section></div>}
  </main>;
}
