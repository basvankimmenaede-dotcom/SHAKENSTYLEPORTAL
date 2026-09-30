'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';

function revalidateClosing() {
  revalidatePath('/planning/afsluitlijst');
  revalidatePath('/planning/afsluitlijst/beheer');
  revalidatePath('/planning');
}

export async function addClosingTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const label = String(formData.get('label') ?? '').trim();
  const itemType = formData.get('item_type') === 'heading' ? 'heading' : 'item';
  if (!label) return;

  const { data: lastItem, error: orderError } = await supabase
    .from('closing_checklist_template_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);

  const { error } = await supabase
    .from('closing_checklist_template_items')
    .insert({
      label,
      sort_order: Number(lastItem?.sort_order ?? 0) + 10,
      is_active: true,
      item_type: itemType,
    });

  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function updateClosingTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get('item_id'));
  const label = String(formData.get('label') ?? '').trim();
  const sortOrder = Number(formData.get('sort_order'));
  const isActive = formData.get('is_active') === 'on';
  const itemType = formData.get('item_type') === 'heading' ? 'heading' : 'item';

  if (!Number.isFinite(id) || !Number.isFinite(sortOrder) || !label) return;

  const { error } = await supabase
    .from('closing_checklist_template_items')
    .update({
      label,
      sort_order: sortOrder,
      is_active: isActive,
      item_type: itemType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function deleteClosingTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get('item_id'));
  if (!Number.isFinite(id)) return;

  const { error } = await supabase
    .from('closing_checklist_template_items')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function setClosingExemption(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const date = String(formData.get('date') ?? '').trim();
  const exempt = formData.get('exempt') === 'on';
  const reason = String(formData.get('reason') ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  if (exempt) {
    const { error } = await supabase
      .from('closing_checklist_exemptions')
      .upsert({
        checklist_date: date,
        reason: reason || 'Vrije dag',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'checklist_date' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('closing_checklist_exemptions')
      .delete()
      .eq('checklist_date', date);
    if (error) throw new Error(error.message);
  }

  revalidateClosing();
}
