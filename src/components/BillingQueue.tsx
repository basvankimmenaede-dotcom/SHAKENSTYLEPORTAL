'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type BillingStatus = 'open' | 'invoiced' | 'skip';
type Filter = BillingStatus | 'all';

export type BillingQueueItem = {
  id: string;
  source_type: 'rentman' | 'manual';
  supplier_invoice_id?: string | null;
  linked_supplier_invoice?: {
    id: string; invoice_number: string; supplier_name: string; total_amount: number | null; status: string
  } | null;
  rentman_project_number?: string | null;
  project_name: string;
  customer_name?: string | null;
  usage_start?: string | null;
  usage_end?: string | null;
  status: BillingStatus;
  note?: string | null;
  created_at: string;
  completed_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export default function BillingQueue({
  initialItems,
  canManage,
  children,
  initialProjectNumber = '',
}: {
  initialItems: BillingQueueItem[];
  canManage: boolean;
  children?: ReactNode;
  initialProjectNumber?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>(initialProjectNumber?'all':'open');
  const [projectNumber,setProjectNumber] = useState(initialProjectNumber);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const counts = useMemo(() => items.reduce<Record<BillingStatus, number>>((acc, item) => {
    acc[item.status] += 1;
    return acc;
  }, { open: 0, invoiced: 0, skip: 0 }), [items]);

  const visible = useMemo(() => (
    items.filter(item=>(filter==='all'||item.status===filter)&&
      (!projectNumber||String(item.rentman_project_number||'').includes(projectNumber)))
  ), [filter, items, projectNumber]);

  async function updateStatus(item: BillingQueueItem, status: BillingStatus) {
    if (pending.has(item.id)) return;
    const previous = item;

    setError('');
    setPending((current) => new Set(current).add(item.id));
    setItems((current) => current.map((row) => row.id === item.id
      ? {
          ...row,
          status,
          completed_at: status === 'open' ? null : new Date().toISOString(),
        }
      : row));

    const response = await fetch(`/api/planning/billing/items/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setItems((current) => current.map((row) => row.id === item.id ? previous : row));
      setError(result.error || 'Facturatiestatus kon niet worden opgeslagen.');
    } else {
      const result = await response.json().catch(() => ({}));
      if (result.completedAt) {
        setItems((current) => current.map((row) => row.id === item.id
          ? { ...row, completed_at: result.completedAt }
          : row));
      }
    }

    setPending((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  return (
    <>
      <nav className="billingTabs" aria-label="Facturatiefilter">
        <button type="button" onClick={() => setFilter('open')} className={filter === 'open' ? 'active' : ''}>Open ({counts.open})</button>
        <button type="button" onClick={() => setFilter('invoiced')} className={filter === 'invoiced' ? 'active' : ''}>Gefactureerd ({counts.invoiced})</button>
        <button type="button" onClick={() => setFilter('skip')} className={filter === 'skip' ? 'active' : ''}>Niet factureren ({counts.skip})</button>
        <button type="button" onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''}>Alles</button>
      </nav>

      {initialProjectNumber&&<div className="billingProjectFilter"><label>Projectnummer
       <input className="input" value={projectNumber} onChange={e=>setProjectNumber(e.target.value)} placeholder="Bijv. 11057"/></label>
       <button type="button" className="button secondary" onClick={()=>{setProjectNumber('');setFilter('open');}}>Alle projecten tonen</button>
      </div>}
      {children}

      {error ? <div className="notice">{error}</div> : null}

      <section className="billingList">
        {visible.length ? visible.map((item) => {
          const isPending = pending.has(item.id);
          return (
            <article className="billingRow" key={item.id} aria-busy={isPending}>
              <div className="billingSource">
                <span className={item.source_type === 'rentman' ? 'billingSourceBadge rentman' : 'billingSourceBadge manual'}>
                  {item.source_type === 'rentman' ? 'Rentman' : 'Handmatig'}
                </span>
              </div>
              <div className="billingMain">
                <strong><Link href={'/planning/billing/'+encodeURIComponent(item.id)}>
                  {item.rentman_project_number ? `#${item.rentman_project_number} · ` : ''}
                  {item.project_name}
                </Link></strong>
                <span>
                  {item.customer_name || 'Geen klant'}
                  {item.usage_end ? ` · geëindigd ${formatDate(item.usage_end)}` : ''}
                </span>
                {item.note ? <small>{item.note}</small> : null}
                {item.linked_supplier_invoice&&
                  <a className="billingSupplierLink"
                    href={'/planning/crew-invoices?view='+
                      (item.linked_supplier_invoice.status==='approved'?'archive':'open')+
                      '&q='+encodeURIComponent(item.linked_supplier_invoice.invoice_number)}>
                    Inkoopfactuur: {item.linked_supplier_invoice.supplier_name} · {item.linked_supplier_invoice.invoice_number} ·
                    {' '}{Number(item.linked_supplier_invoice.total_amount||0).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})}
                  </a>}
              </div>
              <div className="billingState">
                <Link href={'/planning/billing/'+encodeURIComponent(item.id)} className="button secondary">Open project</Link>
                {item.status === 'invoiced' ? <span className="billingDone">Gefactureerd {formatDate(item.completed_at)}</span> : null}
                {item.status === 'skip' ? <span className="billingSkipped">Niet factureren</span> : null}
                {canManage ? (
                  <div className="billingActions">
                    {item.status !== 'invoiced' ? (
                      <button className="button orange" type="button" disabled={isPending} onClick={() => updateStatus(item, 'invoiced')}>
                        {isPending ? 'Opslaan…' : '✓ Gefactureerd'}
                      </button>
                    ) : (
                      <button className="button secondary" type="button" disabled={isPending} onClick={() => updateStatus(item, 'open')}>
                        {isPending ? 'Opslaan…' : 'Heropenen'}
                      </button>
                    )}
                    {item.status === 'open' ? (
                      <button className="button secondary" type="button" disabled={isPending} onClick={() => updateStatus(item, 'skip')}>
                        Niet factureren
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <div className="card compactEmpty">Geen facturatieregels in deze weergave.</div>
        )}
      </section>
    </>
  );
}
