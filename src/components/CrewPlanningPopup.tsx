'use client';

import { useEffect, useState } from 'react';

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
  initialNotes?: string | null;
  initialBar?: string | null;
};

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

export default function CrewPlanningPopup(props: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(props.initialNotes ?? '');
  const [bar, setBar] = useState(props.initialBar ?? '');
  const [savedNotes, setSavedNotes] = useState(props.initialNotes ?? '');
  const [savedBar, setSavedBar] = useState(props.initialBar ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus('');

    const response = await fetch('/api/planning/crew-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentId: props.assignmentId,
        projectId: props.projectId ?? null,
        notes,
        bar,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(result.error || 'Opslaan mislukt.');
      setSaving(false);
      return;
    }

    setSavedNotes(notes);
    setSavedBar(bar);
    setStatus('Opgeslagen');
    setSaving(false);
  }

  const role = [props.functionName, props.groupName].filter(Boolean).join(' · ');

  return (
    <>
      <button
        type="button"
        className="planningCrewRow planningCrewRowButton"
        onClick={() => {
          setNotes(savedNotes);
          setBar(savedBar);
          setStatus('');
          setOpen(true);
        }}
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
                <span>{role}</span>
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

            <div className="crewPlanningSchedule">
              <div className="crewPlanningScheduleHeader">
                <span>Tijdschema volgens Rentman</span>
                <small>{formatDate(props.start)}</small>
              </div>
              <div className="crewPlanningScheduleRow">
                <strong>{formatTime(props.start)}</strong>
                <span>–</span>
                <strong>{formatTime(props.end)}</strong>
                <b>{role}</b>
              </div>
            </div>

            <label className="crewPlanningField">
              <span>Notities</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Bijv. glaswerk meenemen, bijzonderheden voor pakbon..."
                rows={3}
              />
            </label>

            <label className="crewPlanningField">
              <span>Bar</span>
              <input
                value={bar}
                onChange={(event) => setBar(event.target.value)}
                placeholder="Bijv. Frontbar 1"
              />
            </label>

            <div className="crewPlanningModalFooter">
              <small className={status && status !== 'Opgeslagen' ? 'planningInlineError' : ''}>
                {status}
              </small>
              <button type="button" className="button orange" onClick={save} disabled={saving}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
