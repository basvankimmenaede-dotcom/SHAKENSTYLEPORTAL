'use client';

import { useMemo, useState } from 'react';

export type BartenderExportRow = {
  projectNumber: string;
  projectName: string;
  dateLabel: string;
  dateKey: string;
  timeLabel: string;
  location: string;
  city: string;
  open: number;
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function OpenShiftsExport({
  rows,
  periodLabel,
}: {
  rows: BartenderExportRow[];
  periodLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (!rows.length) return '';

    const lines = [`Bartender-uitvraag · ${periodLabel}`, ''];
    let previousProject = '';

    for (const row of rows) {
      const projectKey = `${row.projectNumber}-${row.dateKey}`;
      if (projectKey !== previousProject) {
        if (previousProject) lines.push('');
        lines.push(`${row.dateLabel} · #${row.projectNumber} ${row.projectName}`);
        lines.push([row.location, row.city].filter(Boolean).join(', '));
        previousProject = projectKey;
      }
      lines.push(`• ${row.timeLabel} · ${row.open} ${row.open === 1 ? 'plek' : 'plekken'} open`);
    }

    return lines.join('\n');
  }, [rows, periodLabel]);

  async function copyText() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadCsv() {
    if (!rows.length) return;
    const header = ['Datum','Tijd','Projectnummer','Project','Locatie','Plaats','Open plekken'];
    const body = rows.map((row) => [
      row.dateKey,
      row.timeLabel,
      row.projectNumber,
      row.projectName,
      row.location,
      row.city,
      row.open,
    ]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bartender-shifts-${rows[0]?.dateKey ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="button orange" type="button" onClick={copyText} disabled={!rows.length}>
        {copied ? 'Gekopieerd' : 'Kopieer bartender-uitvraag'}
      </button>
      <button className="button secondary" type="button" onClick={downloadCsv} disabled={!rows.length}>
        CSV downloaden
      </button>
    </div>
  );
}
