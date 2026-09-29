import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';

export async function POST(request: Request) {
  const { supabase, user } = await requirePlanningUser();

  try {
    const body = await request.json();
    const taskId = String(body.taskId ?? '').trim();
    const assigneeProfileId = body.assigneeProfileId ? String(body.assigneeProfileId) : null;

    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'Taak ontbreekt.' }, { status: 400 });
    }

    if (!assigneeProfileId) {
      const { error } = await supabase
        .from('planning_task_assignments')
        .delete()
        .eq('todoist_task_id', taskId);

      if (error) throw error;
      return NextResponse.json({ ok: true, assigneeProfileId: null });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,full_name,role')
      .eq('id', assigneeProfileId)
      .in('role', ['admin', 'warehouse'])
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ ok: false, error: 'Deze persoon kan niet aan planningstaken worden toegewezen.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('planning_task_assignments')
      .upsert({
        todoist_task_id: taskId,
        assignee_profile_id: assigneeProfileId,
        assigned_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'todoist_task_id' });

    if (error) throw error;

    return NextResponse.json({ ok: true, assigneeProfileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Toewijzing kon niet worden opgeslagen.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
