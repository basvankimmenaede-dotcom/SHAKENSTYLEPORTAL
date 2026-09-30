import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { updatePlanningTodoistTask } from '@/lib/todoist';
import { createAdminClient } from '@/lib/supabase/admin';

function normalizePriority(value: unknown) {
  const priority = Number(value);
  return [1, 2, 3, 4].includes(priority) ? priority : 1;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, profile } = await requirePlanningUser();

  try {
    const { id } = await params;
    const body = await request.json();
    const content = String(body.content ?? '').trim();
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    const useDeadline = Boolean(body.useDeadline);
    const priority = normalizePriority(body.priority);
    const requestedArea = String(body.taskArea ?? '').trim();
    const existingArea = requestedArea === 'warehouse' || requestedArea === 'both' ? requestedArea : 'office';
    const taskArea = profile.role === 'warehouse'
      ? (existingArea === 'both' ? 'both' : 'warehouse')
      : existingArea;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Taak ontbreekt.' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ ok: false, error: 'Vul een taaknaam in.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('planning_task_assignments')
      .select('assignee_profile_id,task_area')
      .eq('todoist_task_id', id)
      .maybeSingle();

    if (profile.role === 'warehouse' && existing?.task_area !== 'warehouse' && existing?.task_area !== 'both') {
      return NextResponse.json({ ok: false, error: 'Geen toegang tot deze kantoortaak.' }, { status: 403 });
    }

    if (taskArea === 'office' && existing?.assignee_profile_id) {
      const admin = createAdminClient();
      const { data: assignee } = await admin
        .from('profiles')
        .select('role')
        .eq('id', existing.assignee_profile_id)
        .maybeSingle();

      if (assignee?.role === 'warehouse') {
        return NextResponse.json({
          ok: false,
          error: 'Deze taak staat nog op een magazijngebruiker. Wijzig eerst de toewijzing.',
        }, { status: 400 });
      }
    }

    const task = await updatePlanningTodoistTask({
      taskId: id,
      content,
      dueDate,
      useDeadline,
      priority,
    });

    const { error: metadataError } = await supabase
      .from('planning_task_assignments')
      .upsert({
        todoist_task_id: id,
        task_area: taskArea,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'todoist_task_id' });

    if (metadataError) throw metadataError;

    return NextResponse.json({ ok: true, task, taskArea });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Taak kon niet worden gewijzigd.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
