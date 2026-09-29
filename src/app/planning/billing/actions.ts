'use server';

import { revalidatePath } from 'next/cache';
import { requireModulePermission } from '@/lib/auth';

export async function addManualBillingItem(formData: FormData) {
  const { supabase, user } = await requireModulePermission('billing', 'manage');
  const projectName = String(formData.get('project_name') ?? '').trim();
  const customerName = String(formData.get('customer_name') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (!projectName) return;

  const { error } = await supabase.from('billing_items').insert({
    source_type: 'manual',
    project_name: projectName,
    customer_name: customerName || null,
    note: note || null,
    status: 'open',
    created_by: user.id,
  });

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
