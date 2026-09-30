import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { updatePlanningTodoistTask } from '@/lib/todoist';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePlanningUser();

  try {
    const { id } = await params;
    const body = await request.json();
    const content = String(body.content ?? '').trim();
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    const useDeadline = Boolean(body.useDeadline);

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Taak ontbreekt.' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ ok: false, error: 'Vul een taaknaam in.' }, { status: 400 });
    }

    const task = await updatePlanningTodoistTask({
      taskId: id,
      content,
      dueDate,
      useDeadline,
    });

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Taak kon niet worden gewijzigd.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
