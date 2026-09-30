import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { completePlanningTodoistTask } from '@/lib/todoist';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, profile } = await requirePlanningUser();
  const { id } = await params;

  if (profile.role === 'warehouse') {
    const { data: metadata } = await supabase
      .from('planning_task_assignments')
      .select('task_area')
      .eq('todoist_task_id', id)
      .maybeSingle();

    if (metadata?.task_area !== 'warehouse') {
      return NextResponse.json({ ok: false, error: 'Geen toegang tot deze kantoortaak.' }, { status: 403 });
    }
  }

  try {
    await completePlanningTodoistTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Todoist-taak kon niet worden afgerond.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
