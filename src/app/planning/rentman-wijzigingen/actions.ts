'use server';

import { revalidatePath } from 'next/cache';
import { requirePlanningUser } from '@/lib/auth';

export async function createRentmanChange(formData: FormData) {
  const { supabase, user } = await requirePlanningUser();
  const reportType = formData.get('report_type') === 'wrong_item' ? 'wrong_item' : 'project_change';
  const projectNumber = String(formData.get('project_number') ?? '').trim();
  const projectName = String(formData.get('project_name') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  if (!projectNumber || !summary) return;

  const { error } = await supabase.from('rentman_changes').insert({
    report_type: reportType,
    project_number: projectNumber,
    project_name: projectName || null,
    summary,
    item_name: String(formData.get('item_name') ?? '').trim() || null,
    issue_type: String(formData.get('issue_type') ?? '').trim() || null,
    current_value: String(formData.get('current_value') ?? '').trim() || null,
    desired_value: String(formData.get('desired_value') ?? '').trim() || null,
    change_date: String(formData.get('change_date') ?? '').trim() || null,
    extra_notes: String(formData.get('extra_notes') ?? '').trim() || null,
    reported_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/planning/rentman-wijzigingen');
}

export async function updateRentmanChangeStatus(formData: FormData) {
  const { supabase } = await requirePlanningUser();
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  if (!Number.isFinite(id) || !['open','in_progress','completed'].includes(status)) return;
  const { error } = await supabase.from('rentman_changes').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/planning/rentman-wijzigingen');
}
