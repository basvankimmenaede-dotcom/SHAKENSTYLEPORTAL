import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await requirePlanningUser();
  const { id } = await params;

  try {
    const body = await request.json();
    const completed = Boolean(body.completed);

    const { error } = await supabase
      .from('project_checklist_items')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? user.id : null,
      })
      .eq('id', Number(id));

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checklist kon niet worden bijgewerkt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
