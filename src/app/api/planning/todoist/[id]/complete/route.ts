import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { completePlanningTodoistTask } from '@/lib/todoist';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  try {
    await completePlanningTodoistTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Todoist-taak kon niet worden afgerond.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
