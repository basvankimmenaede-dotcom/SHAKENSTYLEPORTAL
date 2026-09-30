import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const { supabase, user, profile } = await requirePlanningUser();

  try {
    const body = await request.json();
    const taskId = String(body.taskId ?? '').trim();
    const assigneeProfileId = body.assigneeProfileId ? String(body.assigneeProfileId) : null;

    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'Taak ontbreekt.' }, { status: 400 });
    }

    const { data: metadata } = await supabase
      .from('planning_task_assignments')
      .select('task_area')
      .eq('todoist_task_id', taskId)
      .maybeSingle();

    const taskArea = metadata?.task_area === 'warehouse' ? 'warehouse' : 'office';

    if (profile.role === 'warehouse' && taskArea !== 'warehouse') {
      return NextResponse.json({ ok: false, error: 'Geen toegang tot deze kantoortaak.' }, { status: 403 });
    }

    if (!assigneeProfileId) {
      const { error } = await supabase
        .from('planning_task_assignments')
        .upsert({
          todoist_task_id: taskId,
          assignee_profile_id: null,
          assigned_by: user.id,
          task_area: taskArea,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'todoist_task_id' });

      if (error) throw error;
      return NextResponse.json({ ok: true, assigneeProfileId: null });
    }

    const admin = createAdminClient();
    const { data: assignee, error: profileError } = await admin
      .from('profiles')
      .select('id,full_name,role')
      .eq('id', assigneeProfileId)
      .in('role', ['admin', 'warehouse'])
      .maybeSingle();

    if (profileError) throw profileError;
    if (!assignee) {
      return NextResponse.json({ ok: false, error: 'Deze persoon kan niet aan planningstaken worden toegewezen.' }, { status: 400 });
    }

    if (taskArea === 'office' && assignee.role === 'warehouse') {
      return NextResponse.json({
        ok: false,
        error: 'Een kantoortaak kan niet aan een magazijngebruiker worden toegewezen.',
      }, { status: 400 });
    }

    const { error } = await supabase
      .from('planning_task_assignments')
      .upsert({
        todoist_task_id: taskId,
        assignee_profile_id: assigneeProfileId,
        assigned_by: user.id,
        task_area: taskArea,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'todoist_task_id' });

    if (error) throw error;

    return NextResponse.json({ ok: true, assigneeProfileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Toewijzing kon niet worden opgeslagen.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
