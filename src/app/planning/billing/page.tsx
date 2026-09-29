import Link from 'next/link';
import { addManualBillingItem, setBillingItemStatus } from './actions';
import { requireModulePermission } from '@/lib/auth';
import { amsterdamBillingDateKey, billingSyncNeeded, syncBillingQueueOncePerDay } from '@/lib/billing';
import { getPlanningProjectEquipmentGroups, getPlanningProjects } from '@/lib/rentman';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const { supabase, user, permissionLevel } = await requireModulePermission('billing', 'view');
  const params = await searchParams;
  const status = ['open', 'invoiced', 'skip', 'all'].includes(String(params?.status))
    ? String(params?.status)
    : 'open';
  const canManage = permissionLevel === 'manage';

  if (canManage) {
    const today = amsterdamBillingDateKey();
    const needed = await billingSyncNeeded(supabase, today);
    if (needed) {
      const [planningResult, equipmentGroups] = await Promise.all([
        getPlanningProjects(),
        getPlanningProjectEquipmentGroups(),
      ]);
      await syncBillingQueueOncePerDay({
        supabase,
        projects: planningResult.allProjects,
        equipmentGroups,
        userId: user.id,
        today,
      });
    }
  }

  let query = supabase
    .from('billing_items')
    .select('id,source_type,rentman_project_number,project_name,customer_name,usage_start,usage_end,status,note,created_at,completed_at')
    .order('usage_end', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (status !== 'all') query = query.eq('status', status);

  const { data: items, error } = await query;
  if (error) throw new Error(error.message);

  const countsResult = await supabase
    .from('billing_items')
    .select('status');
  const counts = (countsResult.data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="container billingPage">
      <section className="hero billingHero">
        <div>
          <Link href="/planning" className="billingBack">← Terug naar planning</Link>
          <h1>Facturatie</h1>
          <p>Blijvende werkvoorraad. Regels verdwijnen pas uit Open wanneer je ze zelf afhandelt.</p>
        </div>
        <div className="billingHeroMetric">
          <strong>{counts.open ?? 0}</strong>
          <span>openstaand</span>
        </div>
      </section>

      <nav className="billingTabs">
        <Link href="/planning/billing?status=open" className={status === 'open' ? 'active' : ''}>Open ({counts.open ?? 0})</Link>
        <Link href="/planning/billing?status=invoiced" className={status === 'invoiced' ? 'active' : ''}>Gefactureerd ({counts.invoiced ?? 0})</Link>
        <Link href="/planning/billing?status=skip" className={status === 'skip' ? 'active' : ''}>Niet factureren ({counts.skip ?? 0})</Link>
        <Link href="/planning/billing?status=all" className={status === 'all' ? 'active' : ''}>Alles</Link>
      </nav>

      {canManage ? (
        <details className="card billingManualCard">
          <summary>+ Handmatige facturatieregel toevoegen</summary>
          <form action={addManualBillingItem} className="billingManualForm">
            <div className="field">
              <label htmlFor="project_name">Omschrijving</label>
              <input id="project_name" name="project_name" className="input" required placeholder="Bijv. cocktailtraining kantoor" />
            </div>
            <div className="field">
              <label htmlFor="customer_name">Klant</label>
              <input id="customer_name" name="customer_name" className="input" placeholder="Optioneel" />
            </div>
            <div className="field billingManualNote">
              <label htmlFor="note">Notitie</label>
              <input id="note" name="note" className="input" placeholder="Optioneel" />
            </div>
            <button className="button orange" type="submit">Toevoegen</button>
          </form>
        </details>
      ) : null}

      <section className="billingList">
        {(items ?? []).length ? (items ?? []).map((item) => (
          <article className="billingRow" key={item.id}>
            <div className="billingSource">
              <span className={item.source_type === 'rentman' ? 'billingSourceBadge rentman' : 'billingSourceBadge manual'}>
                {item.source_type === 'rentman' ? 'Rentman' : 'Handmatig'}
              </span>
            </div>
            <div className="billingMain">
              <strong>
                {item.rentman_project_number ? `#${item.rentman_project_number} · ` : ''}
                {item.project_name}
              </strong>
              <span>
                {item.customer_name || 'Geen klant'}
                {item.usage_end ? ` · geëindigd ${formatDate(item.usage_end)}` : ''}
              </span>
              {item.note ? <small>{item.note}</small> : null}
            </div>
            <div className="billingState">
              {item.status === 'invoiced' ? <span className="billingDone">Gefactureerd {formatDate(item.completed_at)}</span> : null}
              {item.status === 'skip' ? <span className="billingSkipped">Niet factureren</span> : null}
              {canManage ? (
                <div className="billingActions">
                  {item.status !== 'invoiced' ? (
                    <form action={setBillingItemStatus}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="status" value="invoiced" />
                      <button className="button orange" type="submit">✓ Gefactureerd</button>
                    </form>
                  ) : (
                    <form action={setBillingItemStatus}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="status" value="open" />
                      <button className="button secondary" type="submit">Heropenen</button>
                    </form>
                  )}
                  {item.status === 'open' ? (
                    <form action={setBillingItemStatus}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="status" value="skip" />
                      <button className="button secondary" type="submit">Niet factureren</button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        )) : (
          <div className="card compactEmpty">Geen facturatieregels in deze weergave.</div>
        )}
      </section>
    </main>
  );
}
