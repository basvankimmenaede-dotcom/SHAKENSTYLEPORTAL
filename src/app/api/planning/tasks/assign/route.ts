import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { parseAssigneeProfileIds, validateAssigneeProfileIds, PlanningTaskAssigneeError } from '@/lib/planningTaskAssignees';

export async function POST(request: Request) {
  const { supabase, user, profile } = await requirePlanningUser();

  try {
    const body = await request.json();
    const taskId = String(body.taskId ?? '').trim();
    const assigneeProfileIds = parseAssigneeProfileIds(body);

    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'Taak ontbreekt.' }, { status: 400 });
    }

    const { data: metadata } = await supabase
      .from('planning_task_assignments')
      .select('task_area')
      .eq('todoist_task_id', taskId)
      .maybeSingle();

    const taskArea = metadata?.task_area === 'warehouse'
      ? 'warehouse'
      : metadata?.task_area === 'both'
        ? 'both'
        : 'office';

    if (profile.role === 'warehouse' && taskArea !== 'warehouse' && taskArea !== 'both') {
      return NextResponse.json({ ok: false, error: 'Geen toegang tot deze kantoortaak.' }, { status: 403 });
    }

    await validateAssigneeProfileIds(assigneeProfileIds, taskArea);
    const { error } = await supabase.from('planning_task_assignments').upsert({
      todoist_task_id: taskId,
      assignee_profile_id: assigneeProfileIds[0] ?? null,
      assignee_profile_ids: assigneeProfileIds,
      assigned_by: user.id,
      task_area: taskArea,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'todoist_task_id' });
    if (error) throw error;
    return NextResponse.json({ ok: true, assigneeProfileIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Toewijzing kon niet worden opgeslagen.';
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof PlanningTaskAssigneeError ? 400 : 500 });
  }
}
