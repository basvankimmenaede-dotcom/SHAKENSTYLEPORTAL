import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { completePlanningTodoistTask } from '@/lib/todoist';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await requirePlanningUser();
  const { id } = await params;

  try {
    const body = await request.json();
    const completed = Boolean(body.completed);

    const itemId = Number(id);
    const { data: existing, error: readError } = await supabase
      .from('project_checklist_items')
      .select('todoist_task_id')
      .eq('id', itemId)
      .single();

    if (readError) throw readError;

    const { error } = await supabase
      .from('project_checklist_items')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? user.id : null,
      })
      .eq('id', itemId);

    if (error) throw error;

    let todoistWarning: string | null = null;
    if (completed && existing?.todoist_task_id) {
      try {
        await completePlanningTodoistTask(existing.todoist_task_id);
      } catch (todoistError) {
        todoistWarning = todoistError instanceof Error
          ? todoistError.message
          : 'Gekoppelde To Do-taak kon niet worden afgerond.';
      }
    }

    return NextResponse.json({ ok: true, todoistWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checklist kon niet worden bijgewerkt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
