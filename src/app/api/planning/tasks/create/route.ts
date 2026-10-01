import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { createPlanningTodoistTask } from '@/lib/todoist';
import { createAdminClient } from '@/lib/supabase/admin';

function normalizePriority(value: unknown) {
  const priority = Number(value);
  return [1, 2, 3, 4].includes(priority) ? priority : 1;
}

export async function POST(request: Request) {
  const { supabase, user, profile } = await requirePlanningUser();

  try {
    const body = await request.json();
    const content = String(body.content ?? '').trim();
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    const projectNumber = body.projectNumber ? String(body.projectNumber).trim() : '';
    const projectName = body.projectName ? String(body.projectName).trim() : '';
    const assigneeProfileId = body.assigneeProfileId ? String(body.assigneeProfileId) : null;
    const requestedArea = String(body.taskArea ?? '').trim();
    const taskArea = profile.role === 'warehouse'
      ? 'warehouse'
      : requestedArea === 'warehouse'
        ? 'warehouse'
        : requestedArea === 'both'
          ? 'both'
          : 'office';
    const priority = normalizePriority(body.priority);

    if (!content) {
      return NextResponse.json({ ok: false, error: 'Vul een taak in.' }, { status: 400 });
    }

    const description = projectNumber
      ? `Aangemaakt vanuit SHAKENSTYLE planning · Rentman project ${projectNumber}${projectName ? ` · ${projectName}` : ''}`
      : 'Aangemaakt vanuit SHAKENSTYLE planning';

    const task = await createPlanningTodoistTask({
      content,
      dueDate,
      description,
      priority,
    });

    let validAssigneeProfileId: string | null = null;

    if (assigneeProfileId) {
      const admin = createAdminClient();
      const { data: assignee, error: profileError } = await admin
        .from('profiles')
        .select('id,role')
        .eq('id', assigneeProfileId)
        .in('role', ['admin', 'warehouse'])
        .maybeSingle();

      if (profileError) throw profileError;
      if (!assignee) {
        return NextResponse.json({ ok: false, error: 'Ongeldige persoon voor deze taak.' }, { status: 400 });
      }
      if (taskArea === 'office' && assignee.role === 'warehouse') {
        return NextResponse.json({
          ok: false,
          error: 'Een kantoortaak kan niet aan een magazijngebruiker worden toegewezen.',
        }, { status: 400 });
      }

      validAssigneeProfileId = assigneeProfileId;
    }

    const { error: assignmentError } = await supabase
      .from('planning_task_assignments')
      .upsert({
        todoist_task_id: task.id,
        assignee_profile_id: validAssigneeProfileId,
        assigned_by: user.id,
        task_area: taskArea,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'todoist_task_id' });

    if (assignmentError) throw assignmentError;

    return NextResponse.json({ ok: true, task, taskArea });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Taak kon niet worden aangemaakt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
