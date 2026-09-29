import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';

export async function POST(request: Request) {
  const { supabase, user } = await requirePlanningUser();

  try {
    const body = await request.json();
    const assignmentId = Number(body.assignmentId);
    const projectId = body.projectId == null ? null : Number(body.projectId);
    const notes = String(body.notes ?? '').trim();
    const bar = String(body.bar ?? '').trim();

    if (!Number.isFinite(assignmentId)) {
      return NextResponse.json({ ok: false, error: 'Ongeldige personeelsplanning.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('planning_crew_details')
      .upsert({
        rentman_assignment_id: assignmentId,
        rentman_project_id: Number.isFinite(projectId) ? projectId : null,
        notes: notes || null,
        bar: bar || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'rentman_assignment_id' })
      .select('rentman_assignment_id,notes,bar,updated_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, detail: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gegevens konden niet worden opgeslagen.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
