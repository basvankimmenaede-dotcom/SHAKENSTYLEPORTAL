import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { reschedulePlanningTodoistTask } from '@/lib/todoist';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePlanningUser();

  try {
    const { id } = await params;
    const body = await request.json();
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    const useDeadline = Boolean(body.useDeadline);

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Taak ontbreekt.' }, { status: 400 });
    }

    const task = await reschedulePlanningTodoistTask({
      taskId: id,
      dueDate,
      useDeadline,
    });

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Taak kon niet worden verplaatst.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
