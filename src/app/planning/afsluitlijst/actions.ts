'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';

function revalidateClosing() {
  revalidatePath('/planning/afsluitlijst');
  revalidatePath('/planning/afsluitlijst/beheer');
  revalidatePath('/planning');
}

export async function addClosingSection(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const { data: last } = await supabase
    .from('closing_checklist_sections')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('closing_checklist_sections').insert({
    name,
    sort_order: Number(last?.sort_order ?? 0) + 10,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function updateClosingSection(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get('section_id'));
  const name = String(formData.get('name') ?? '').trim();
  if (!Number.isFinite(id) || !name) return;
  const { error } = await supabase.from('closing_checklist_sections').update({
    name,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function deleteClosingSection(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get('section_id'));
  if (!Number.isFinite(id)) return;
  const { error } = await supabase.from('closing_checklist_sections').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function addClosingTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const label = String(formData.get('label') ?? '').trim();
  const sectionId = Number(formData.get('section_id'));
  const recurrenceType = ['daily', 'weekly', 'interval'].includes(String(formData.get('recurrence_type')))
    ? String(formData.get('recurrence_type'))
    : 'daily';
  const intervalDays = recurrenceType === 'interval' ? Math.max(2, Number(formData.get('interval_days') ?? 2)) : null;
  const recurrenceStartDate = String(formData.get('recurrence_start_date') ?? '').trim();
  if (!label || !Number.isFinite(sectionId)) return;

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
      item_type: 'item',
      section_id: sectionId,
      recurrence_type: recurrenceType,
      interval_days: intervalDays,
      recurrence_start_date: /^\d{4}-\d{2}-\d{2}$/.test(recurrenceStartDate) ? recurrenceStartDate : new Date().toISOString().slice(0, 10),
    });

  if (error) throw new Error(error.message);
  revalidateClosing();
}

export async function updateClosingTemplateItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = Number(formData.get('item_id'));
  const label = String(formData.get('label') ?? '').trim();
  const sectionId = Number(formData.get('section_id'));
  const isActive = formData.get('is_active') === 'on';
  const recurrenceType = ['daily', 'weekly', 'interval'].includes(String(formData.get('recurrence_type')))
    ? String(formData.get('recurrence_type'))
    : 'daily';
  const intervalDays = recurrenceType === 'interval' ? Math.max(2, Number(formData.get('interval_days') ?? 2)) : null;
  const recurrenceStartDate = String(formData.get('recurrence_start_date') ?? '').trim();

  if (!Number.isFinite(id) || !Number.isFinite(sectionId) || !label) return;

  const { error } = await supabase
    .from('closing_checklist_template_items')
    .update({
      label,
      section_id: sectionId,
      is_active: isActive,
      item_type: 'item',
      recurrence_type: recurrenceType,
      interval_days: intervalDays,
      recurrence_start_date: /^\d{4}-\d{2}-\d{2}$/.test(recurrenceStartDate) ? recurrenceStartDate : new Date().toISOString().slice(0, 10),
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
