import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { createPlanningTodoistTask } from '@/lib/todoist';

export async function POST(request: Request) {
  const { supabase, user } = await requirePlanningUser();

  try {
    const body = await request.json();
    const content = String(body.content ?? '').trim();
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    const projectNumber = body.projectNumber ? String(body.projectNumber).trim() : '';
    const projectName = body.projectName ? String(body.projectName).trim() : '';
    const assigneeProfileId = body.assigneeProfileId ? String(body.assigneeProfileId) : null;

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
    });

    if (assigneeProfileId) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', assigneeProfileId)
        .in('role', ['admin', 'warehouse'])
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        return NextResponse.json({ ok: false, error: 'Ongeldige persoon voor deze taak.' }, { status: 400 });
      }

      const { error: assignmentError } = await supabase
        .from('planning_task_assignments')
        .upsert({
          todoist_task_id: task.id,
          assignee_profile_id: assigneeProfileId,
          assigned_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'todoist_task_id' });

      if (assignmentError) throw assignmentError;
    }

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Taak kon niet worden aangemaakt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
