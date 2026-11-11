'use server';

import { revalidatePath } from 'next/cache';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function addManualBillingItem(formData: FormData) {
  const { supabase, user } = await requireModulePermission('billing', 'manage');
  const projectName = String(formData.get('project_name') ?? '').trim();
  const customerName = String(formData.get('customer_name') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const invoiceId = String(formData.get('supplier_invoice_id') ?? '').trim();
  const projectInput = String(formData.get('rentman_project_number') ?? '').trim();
  const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!projectName || projectName.length > 180 || customerName.length > 180 || note.length > 1500) {
    throw new Error('Controleer de omschrijving, klant en notitie.');
  }
  if (projectInput && !/^\\d{4,8}$/.test(projectInput)) {
    throw new Error('Gebruik een geldig Rentman-projectnummer.');
  }
  let sourceNumber: string | null = null;
  let projectNumber = projectInput || null;
  if (invoiceId) {
    if (!validUuid.test(invoiceId)) throw new Error('Ongeldige leveranciersfactuur.');
    const db = createAdminClient();
    const { data: invoice, error: invoiceError } = await db.from('crew_invoices')
      .select('id,supplier_id,invoice_number,status,project_numbers')
      .eq('id', invoiceId).maybeSingle();
    if (invoiceError || !invoice || !invoice.supplier_id ||
      !['received', 'in_review', 'approved'].includes(invoice.status)) {
      throw new Error('De leveranciersfactuur is niet beschikbaar om te koppelen.');
    }
    const { data: linked, error: linkedError } = await supabase.from('billing_items')
      .select('id').eq('supplier_invoice_id', invoiceId).maybeSingle();
    if (linkedError) throw new Error('Koppeling met bestaande facturatieregels kon niet worden gecontroleerd.');
    if (linked) throw new Error('Deze leveranciersfactuur is al gekoppeld aan een handmatige facturatieregel.');
    sourceNumber = invoice.invoice_number;
    if (!projectNumber && Array.isArray(invoice.project_numbers) && invoice.project_numbers.length === 1) {
      const candidate = String(invoice.project_numbers[0]);
      if (/^\\d{4,8}$/.test(candidate)) projectNumber = candidate;
    }
  }
  const { error } = await supabase.from('billing_items').insert({
    source_type: 'manual',
    supplier_invoice_id: invoiceId || null,
    rentman_project_number: projectNumber,
    project_name: projectName,
    customer_name: customerName || null,
    note: note || (sourceNumber ? 'Gekoppelde leveranciersfactuur: ' + sourceNumber : null),
    status: 'open',
    created_by: user.id,
  });

  if (error?.code === '23505' && invoiceId) {
    throw new Error('Deze leveranciersfactuur is ondertussen al gekoppeld. Vernieuw het facturatieoverzicht.');
  }
  if (error) throw new Error(error.message);
  revalidatePath('/planning');
  revalidatePath('/planning/billing');
}

export async function setBillingItemStatus(formData: FormData) {
  const { supabase, user } = await requireModulePermission('billing', 'manage');
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();

  if (!id || !['open', 'invoiced', 'skip'].includes(status)) return;

  const completed = status === 'open' ? null : new Date().toISOString();
  const { error } = await supabase
    .from('billing_items')
    .update({
      status,
      completed_at: completed,
      completed_by: status === 'open' ? null : user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/planning');
  revalidatePath('/planning/billing');
}
