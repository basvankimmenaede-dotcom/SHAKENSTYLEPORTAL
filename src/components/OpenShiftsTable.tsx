'use client';

import { useState } from 'react';
import styles from '@/app/planning/open-shifts/page.module.css';

export type OpenShiftTableRow = {
  id: number;
  projectNumber: string;
  projectName: string;
  location: string;
  city: string;
  functionGroup: string;
  functionName: string;
  dateLabel: string;
  timeLabel: string;
  needed: number;
  planned: number;
  open: number;
  status: 'open' | 'critical' | 'filled';
};

function statusLabel(status: OpenShiftTableRow['status']) {
  if (status === 'critical') return 'Kritiek';
  if (status === 'filled') return 'Gevuld';
  return 'Open';
}

export default function OpenShiftsTable({ rows }: { rows: OpenShiftTableRow[] }) {
  const [selected, setSelected] = useState<OpenShiftTableRow | null>(null);

  return (
    <>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Functiegroep</th>
              <th>Functie</th>
              <th>Datum</th>
              <th>Tijd</th>
              <th>Nodig</th>
              <th>Gepland</th>
              <th>Open</th>
              <th>Status</th>
              <th aria-label="Acties" />
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className={styles.clickableRow} onClick={() => setSelected(row)}>
                <td>
                  <strong>#{row.projectNumber} · {row.projectName}</strong>
                  <small>{row.location}{row.city ? `, ${row.city}` : ''}</small>
                </td>
                <td>{row.functionGroup}</td>
                <td>{row.functionName}</td>
                <td>{row.dateLabel}</td>
                <td>{row.timeLabel}</td>
                <td>{row.needed}</td>
                <td>{row.planned}</td>
                <td className={row.open ? styles.openCount : undefined}>{row.open}</td>
                <td><span className={`${styles.badge} ${styles[row.status]}`}>{statusLabel(row.status)}</span></td>
                <td>
                  <button
                    type="button"
                    className={styles.viewShiftButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelected(row);
                    }}
                  >
                    Bekijken
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={10} className={styles.empty}>Geen shifts gevonden binnen deze selectie.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setSelected(null)}>
          <section
            className={styles.shiftModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shift-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.shiftModalHeader}>
              <div>
                <span className={styles.eyebrow}>Shift</span>
                <h2 id="shift-modal-title">{selected.functionName}</h2>
                <p>#{selected.projectNumber} · {selected.projectName}</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setSelected(null)} aria-label="Sluiten">×</button>
            </div>

            <div className={styles.shiftDetailsGrid}>
              <div><span>Functiegroep</span><strong>{selected.functionGroup}</strong></div>
              <div><span>Status</span><strong>{statusLabel(selected.status)}</strong></div>
              <div><span>Datum</span><strong>{selected.dateLabel}</strong></div>
              <div><span>Tijd</span><strong>{selected.timeLabel}</strong></div>
              <div><span>Locatie</span><strong>{selected.location}{selected.city ? `, ${selected.city}` : ''}</strong></div>
              <div><span>Bezetting</span><strong>{selected.planned} gepland · {selected.open} open van {selected.needed}</strong></div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
