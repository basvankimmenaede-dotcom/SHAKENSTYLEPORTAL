import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { createPlanningTodoistTask } from '@/lib/todoist';

export async function POST(request: Request) {
  await requirePlanningUser();

  try {
    const body = await request.json();
    const content = String(body.content ?? '').trim();
    const dueDate = body.dueDate ? String(body.dueDate) : null;
    const projectNumber = body.projectNumber ? String(body.projectNumber).trim() : '';
    const projectName = body.projectName ? String(body.projectName).trim() : '';

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

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Taak kon niet worden aangemaakt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
