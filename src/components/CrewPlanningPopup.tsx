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
  people?: Array<{ name: string; initials: string }>;
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
  vehicles?: Array<{
    id: number;
    name: string;
    licensePlate?: string | null;
    functionName?: string | null;
    start?: string | null;
    end?: string | null;
  }>;
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
  const people = props.people?.length ? props.people : [{ name: props.name, initials: props.initials }];
  const displayName = people.length === 1
    ? people[0].name
    : people.length === 2
      ? `${people[0].name} + ${people[1].name}`
      : `${people[0].name}, ${people[1].name} +${people.length - 2}`;
  const firstName = (value: string) => value.trim().split(/\s+/)[0] || value;
  const rowDisplayName = people.length === 1
    ? people[0].name
    : people.length === 2
      ? `${firstName(people[0].name)} + ${firstName(people[1].name)}`
      : `${firstName(people[0].name)} + ${firstName(people[1].name)} +${people.length - 2}`;
  const timeline = props.timeline ?? [];
  const vehicles = props.vehicles ?? [];

  return (
    <>
      <button
        type="button"
        className={`planningCrewRow planningCrewRowButton${people.length > 1 ? ' grouped' : ''}`}
        onClick={() => setOpen(true)}
      >
        <span className="planningCrewAvatarStack" aria-hidden="true">
          {people.slice(0, 3).map((person, index) => (
            <span className="planningCrewAvatar" key={`${person.name}-${index}`}>
              {person.initials || '—'}
            </span>
          ))}
        </span>
        <span className="planningCrewPerson">
          <strong>{rowDisplayName}</strong>
          <span>{role}{people.length > 1 ? ` · ${people.length}p` : ''}</span>
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
            aria-label={`Planning van ${displayName}`}
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
              <span className="crewPlanningModalAvatarStack">
                {people.slice(0, 3).map((person, index) => (
                  <span className="crewPlanningModalAvatar" key={`${person.name}-modal-${index}`}>
                    {person.initials || '—'}
                  </span>
                ))}
              </span>
              <div>
                <h2>{displayName}</h2>
                <span className="crewPlanningModalRole">{role}{people.length > 1 ? ` · ${people.length} personen` : ''}</span>
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
              <div className="crewPlanningReadOnlyCard crewPlanningNotesCard">
                <span>Notities</span>
                <p>{props.notes || '—'}</p>
              </div>
              <div className="crewPlanningReadOnlyCard">
                <span>Bar</span>
                <p>{props.bar || '—'}</p>
              </div>
            </div>

            <div className="crewPlanningVehicleCard">
              <span>Bus / voertuig</span>
              {vehicles.length ? (
                <div className="crewPlanningVehicleList">
                  {vehicles.map((vehicle) => (
                    <div className="crewPlanningVehicleRow" key={vehicle.id}>
                      <div>
                        <strong>{vehicle.name}</strong>
                        {vehicle.licensePlate ? <small>{vehicle.licensePlate}</small> : null}
                      </div>
                      <div>
                        {vehicle.functionName ? <span>{vehicle.functionName}</span> : null}
                        {(vehicle.start || vehicle.end) ? (
                          <small>{formatShortDate(vehicle.start)} · {formatTime(vehicle.start)} – {formatTime(vehicle.end)}</small>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Geen bus gepland in Rentman.</p>
              )}
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
