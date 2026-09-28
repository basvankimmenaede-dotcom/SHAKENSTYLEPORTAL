'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';

function templatePath() {
  revalidatePath('/planning/templates');
  revalidatePath('/planning');
}

export async function createChecklistTemplate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!name) return;

  const { error } = await supabase
    .from('checklist_templates')
    .insert({ name, description, is_active: true });

  if (error) throw new Error(error.message);
  templatePath();
}

export async function updateChecklistTemplate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const templateId = Number(formData.get('template_id'));
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const isActive = formData.get('is_active') === 'on';

  if (!Number.isFinite(templateId) || !name) return;

  const { error } = await supabase
    .from('checklist_templates')
    .update({
      name,
      description,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId);

  if (error) throw new Error(error.message);
  templatePath();
}

export async function addChecklistTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const templateId = Number(formData.get('template_id'));
  const label = String(formData.get('label') ?? '').trim();
  const isRequired = formData.get('is_required') === 'on';
  const deadlineRaw = String(formData.get('deadline_offset_days') ?? '').trim();
  const deadlineOffsetDays = deadlineRaw === '' ? null : Number(deadlineRaw);

  if (
    !Number.isFinite(templateId)
    || !label
    || (deadlineOffsetDays !== null && !Number.isFinite(deadlineOffsetDays))
  ) return;

  const { data: lastItem, error: orderError } = await supabase
    .from('checklist_template_items')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);

  const nextOrder = Number(lastItem?.sort_order ?? 0) + 10;
  const { error } = await supabase
    .from('checklist_template_items')
    .insert({
      template_id: templateId,
      label,
      is_required: isRequired,
      sort_order: nextOrder,
      deadline_offset_days: deadlineOffsetDays,
    });

  if (error) throw new Error(error.message);
  templatePath();
}

export async function updateChecklistTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const itemId = Number(formData.get('item_id'));
  const label = String(formData.get('label') ?? '').trim();
  const sortOrder = Number(formData.get('sort_order'));
  const isRequired = formData.get('is_required') === 'on';
  const deadlineRaw = String(formData.get('deadline_offset_days') ?? '').trim();
  const deadlineOffsetDays = deadlineRaw === '' ? null : Number(deadlineRaw);

  if (
    !Number.isFinite(itemId)
    || !label
    || !Number.isFinite(sortOrder)
    || (deadlineOffsetDays !== null && !Number.isFinite(deadlineOffsetDays))
  ) return;

  const { error } = await supabase
    .from('checklist_template_items')
    .update({
      label,
      sort_order: sortOrder,
      is_required: isRequired,
      deadline_offset_days: deadlineOffsetDays,
    })
    .eq('id', itemId);

  if (error) throw new Error(error.message);
  templatePath();
}

export async function deleteChecklistTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const itemId = Number(formData.get('item_id'));
  if (!Number.isFinite(itemId)) return;

  const { error } = await supabase
    .from('checklist_template_items')
    .delete()
    .eq('id', itemId);

  if (error) throw new Error(error.message);
  templatePath();
}
