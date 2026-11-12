import Link from 'next/link';
import { addManualBillingItem } from './actions';
import BillingQueue, { type BillingQueueItem } from '@/components/BillingQueue';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { amsterdamBillingDateKey, billingSyncNeeded, syncBillingQueueOncePerDay } from '@/lib/billing';
import { getPlanningProjectEquipmentGroups, getPlanningProjects } from '@/lib/rentman';

export default async function BillingPage({searchParams}:{searchParams:Promise<{project?:string;supplierInvoice?:string}>}) {
  const params=await searchParams;
  const projectNumber=/^\d{4,8}$/.test(params.project||'')?params.project||'':'';
  const requestedInvoice=/^[0-9a-f-]{36}$/i.test(params.supplierInvoice||'')?params.supplierInvoice||'':'';
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
    .select('id,source_type,supplier_invoice_id,rentman_project_number,project_name,customer_name,usage_start,usage_end,status,note,created_at,completed_at')
    .order('usage_end', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const billingItems = (items ?? []) as BillingQueueItem[];
  const linkedIds = new Set(billingItems.map(row => row.supplier_invoice_id).filter((id): id is string => Boolean(id)));
  const admin = createAdminClient();
  type SupplierInvoiceRow = {id:string;supplier_id:string;invoice_number:string;invoice_date:string|null;total_amount:number|null;status:string;project_numbers:string[]};
  const [candidateResult,linkedResult] = await Promise.all([
    canManage ? admin.from('crew_invoices')
      .select('id,supplier_id,invoice_number,invoice_date,total_amount,status,project_numbers')
      .not('supplier_id','is',null)
      .in('status',['received','in_review','approved'])
      .order('created_at',{ascending:false}).limit(500)
      : Promise.resolve({data:[],error:null}),
    linkedIds.size ? admin.from('crew_invoices')
      .select('id,supplier_id,invoice_number,invoice_date,total_amount,status,project_numbers')
      .in('id',Array.from(linkedIds))
      : Promise.resolve({data:[],error:null}),
  ]);
  if (candidateResult.error || linkedResult.error) throw new Error('Leveranciersfacturen konden niet worden geladen.');
  const invoiceRows = new Map<string,SupplierInvoiceRow>();
  for (const row of [...(candidateResult.data||[]),...(linkedResult.data||[])] as SupplierInvoiceRow[]) {
    invoiceRows.set(row.id,row);
  }
  const supplierIds = [...new Set([...invoiceRows.values()].map(row=>row.supplier_id))];
  const {data:supplierNames,error:supplierError} = supplierIds.length ?
    await admin.from('invoice_suppliers').select('id,company_name').in('id',supplierIds)
    : {data:[],error:null};
  if (supplierError) throw new Error('Leveranciersnamen konden niet worden geladen.');
  const supplierMap = new Map((supplierNames||[]).map(s=>[s.id,s.company_name]));
  const supplierInvoices = [...invoiceRows.values()].map(invoice=>({
    ...invoice,supplier_name:supplierMap.get(invoice.supplier_id)||'Onbekende leverancier'
  }));
  const availableInvoices = supplierInvoices.filter(i=>
    !linkedIds.has(i.id) && ['received','in_review','approved'].includes(i.status)
  ).sort((a,b)=>(b.invoice_date||'').localeCompare(a.invoice_date||''));
  const selectedInvoice = availableInvoices.find(i=>i.id===requestedInvoice);
  const withLinks = billingItems.map(item=>({
    ...item,
    linked_supplier_invoice: item.supplier_invoice_id ? supplierInvoices.find(i=>i.id===item.supplier_invoice_id)||null : null
  }));
  const openCount = billingItems.filter((item) => item.status === 'open').length;

  return (
    <main className="container billingPage">
      <section className="hero billingHero">
        <div>
          <Link href="/planning" className="billingBack">← Terug naar planning</Link>
          <h1>Uitgaande facturen</h1>
          <p>Facturen voor klanten opmaken per Rentman-project: de geregistreerde uren uit shiftrapporten zijn de basis, de planning dient als vergelijking.</p>
          <p>De bedragen en uurtarieven van inkomende bartenderfacturen spelen bij onze klantcalculatie geen rol.</p>
        </div>
        <div className="billingHeroMetric">
          <strong>{openCount}</strong>
          <span>openstaand</span>
        </div>
      </section>

      <BillingQueue initialItems={withLinks} canManage={canManage} initialProjectNumber={projectNumber}>
        {canManage ? (
          <details className="card billingManualCard" open={Boolean(selectedInvoice)}>
            <summary>+ Nieuwe handmatige facturatieregel</summary>
            <form action={addManualBillingItem} className="billingManualForm">
              <div className="field billingManualSupplierSelect">
                <label htmlFor="supplier_invoice_id">Leveranciersfactuur koppelen (optioneel)</label>
                <select id="supplier_invoice_id" name="supplier_invoice_id" className="select"
                  defaultValue={selectedInvoice?.id||''}>
                  <option value="">Geen leveranciersfactuur koppelen</option>
                  {availableInvoices.map(invoice=><option key={invoice.id} value={invoice.id}>
                    {invoice.supplier_name} · {invoice.invoice_number} · {Number(invoice.total_amount||0).toLocaleString('nl-NL',{style:'currency',currency:'EUR'})} · {invoice.status==='approved'?'goedgekeurd':'wacht op goedkeuring'}
                  </option>)}
                </select>
                <small>Een leveranciersfactuur is hier alleen een inkoopdocument en wordt niet automatisch doorbelast. Bartenderfacturen staan hier los van.</small>
              </div>
              <div className="field">
                <label htmlFor="project_name">Omschrijving</label>
                <input id="project_name" name="project_name" className="input" required maxLength={180}
                  defaultValue={selectedInvoice?'Doorbelasting '+selectedInvoice.supplier_name+' · '+selectedInvoice.invoice_number:''}
                  placeholder="Bijv. cocktailtraining kantoor" />
              </div>
              <div className="field">
                <label htmlFor="customer_name">Klant</label>
                <input id="customer_name" name="customer_name" className="input" maxLength={180} placeholder="Optioneel" />
              </div>
              <div className="field">
                <label htmlFor="rentman_project_number">Rentman-projectnummer (optioneel)</label>
                <input id="rentman_project_number" name="rentman_project_number" className="input"
                  defaultValue={selectedInvoice?.project_numbers?.length===1?selectedInvoice.project_numbers[0]:''}
                  placeholder="Bijv. 11065" />
              </div>
              <div className="field billingManualNote">
                <label htmlFor="note">Notitie</label>
                <input id="note" name="note" className="input" maxLength={1500}
                  defaultValue={selectedInvoice?'Leveranciersfactuur '+selectedInvoice.invoice_number:''} placeholder="Optioneel" />
              </div>
              <button className="button orange" type="submit">Toevoegen</button>
            </form>
          </details>
        ) : null}
      </BillingQueue>
    </main>
  );
}
