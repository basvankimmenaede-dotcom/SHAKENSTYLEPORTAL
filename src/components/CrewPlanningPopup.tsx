'use client';

type TimelineItem = {
  id: number;
  name?: string | null;
  start?: string | null;
  end?: string | null;
  remark?: string | null;
};

type Props = {
  assignmentId: number;
  projectId?: number | null;
  name: string;
  initials: string;
  functionName: string;
  groupName?: string | null;
  start?: string | null;
  end?: string | null;
  projectNumber?: string | number | null;
  projectName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  bar?: string | null;
  timeline?: TimelineItem[];
};

import { useEffect, useState } from 'react';

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
}

function sameDate(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.slice(0, 10) === b.slice(0, 10));
}

function formatShortDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export default function CrewPlanningPopup(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open]);

  const role = [props.functionName, props.groupName].filter(Boolean).join(' · ');
  const timeline = props.timeline ?? [];

  return (
    <>
      <button
        type="button"
        className="planningCrewRow planningCrewRowButton"
        onClick={() => setOpen(true)}
      >
        <span className="planningCrewAvatar">{props.initials || '—'}</span>
        <span className="planningCrewPerson">
          <strong>{props.name}</strong>
          <span>{role}</span>
        </span>
        <span className="planningCrewShift">
          <strong>{formatTime(props.start)} – {formatTime(props.end)}</strong>
          <span>
            {props.projectName
              ? `#${props.projectNumber ?? props.projectId ?? ''} · ${props.projectName}`
              : 'Rentman activiteit'}
          </span>
        </span>
      </button>

      {open ? (
        <div
          className="crewPlanningModalBackdrop"
          data-planning-modal-open="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="crewPlanningModal"
            role="dialog"
            aria-modal="true"
            aria-label={`Planning van ${props.name}`}
          >
            <button
              type="button"
              className="crewPlanningModalClose"
              onClick={() => setOpen(false)}
              aria-label="Sluiten"
            >
              ×
            </button>

            <div className="crewPlanningModalPerson">
              <span className="crewPlanningModalAvatar">{props.initials || '—'}</span>
              <div>
                <h2>{props.name}</h2>
                <span className="crewPlanningModalRole">{role}</span>
              </div>
            </div>

            <div className="crewPlanningProjectCard">
              <span>Project</span>
              <strong>
                {props.projectNumber ? `#${props.projectNumber} · ` : ''}
                {props.projectName || 'Rentman activiteit'}
              </strong>
            </div>

            <div className="crewPlanningInfoGrid">
              <div className="crewPlanningInfoCard">
                <span>Locatie</span>
                <strong>{props.locationName || 'Geen locatie gekoppeld'}</strong>
                {props.locationAddress ? <small>{props.locationAddress}</small> : null}
              </div>
              <div className="crewPlanningInfoCard">
                <span>Contactpersoon</span>
                <strong>{props.contactName || 'Geen contactpersoon gekoppeld'}</strong>
                {props.contactPhone ? <small>{props.contactPhone}</small> : null}
                {props.contactEmail ? <small>{props.contactEmail}</small> : null}
              </div>
            </div>

            <div className="crewPlanningReadOnlyGrid">
              <div className="crewPlanningReadOnlyCard">
                <span>Notities</span>
                <p>{props.notes || '—'}</p>
              </div>
              <div className="crewPlanningReadOnlyCard">
                <span>Bar</span>
                <p>{props.bar || '—'}</p>
              </div>
            </div>

            <div className="crewPlanningSchedule">
              <div className="crewPlanningScheduleHeader">
                <span>Volledig tijdschema project</span>
                <small>{props.start ? formatDate(props.start) : ''}</small>
              </div>

              {timeline.length ? (
                <div className="crewPlanningTimeline">
                  {timeline.map((item) => {
                    const active = Boolean(
                      props.groupName
                      && item.name
                      && item.name.trim().toLowerCase() === props.groupName.trim().toLowerCase()
                      && sameDate(item.start, props.start)
                    );
                    return (
                      <div
                        className={active ? 'crewPlanningTimelineRow active' : 'crewPlanningTimelineRow'}
                        key={item.id}
                      >
                        <div className="crewPlanningTimelineBody">
                          <strong>{item.name || 'Activiteit'}</strong>
                          {item.remark ? <p>{item.remark}</p> : null}
                        </div>
                        <div className="crewPlanningTimelineMoment">
                          <span>Van</span>
                          <strong>{formatShortDate(item.start)}</strong>
                          <small>{formatTime(item.start)}</small>
                        </div>
                        <div className="crewPlanningTimelineMoment">
                          <span>Tot</span>
                          <strong>{formatShortDate(item.end)}</strong>
                          <small>{formatTime(item.end)}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="crewPlanningTimelineEmpty">
                  Geen projectschema gevonden in Rentman.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
