import Link from 'next/link';
import { addManualBillingItem } from './actions';
import BillingQueue, { type BillingQueueItem } from '@/components/BillingQueue';
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

export default async function BillingPage() {
  const { supabase, user, permissionLevel } = await requireModulePermission('billing', 'view');
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

  const { data: items, error } = await supabase
    .from('billing_items')
    .select('id,source_type,rentman_project_number,project_name,customer_name,usage_start,usage_end,status,note,created_at,completed_at')
    .order('usage_end', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const billingItems = (items ?? []) as BillingQueueItem[];
  const openCount = billingItems.filter((item) => item.status === 'open').length;

  return (
    <main className="container billingPage">
      <section className="hero billingHero">
        <div>
          <Link href="/planning" className="billingBack">← Terug naar planning</Link>
          <h1>Facturatie</h1>
          <p>Blijvende werkvoorraad. Regels verdwijnen pas uit Open wanneer je ze zelf afhandelt.</p>
        </div>
        <div className="billingHeroMetric">
          <strong>{openCount}</strong>
          <span>openstaand</span>
        </div>
      </section>

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

      <BillingQueue initialItems={billingItems} canManage={canManage} />
    </main>
  );
}
