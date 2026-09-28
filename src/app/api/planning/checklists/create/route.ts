import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';

export async function POST(request: Request) {
  const { supabase } = await requirePlanningUser();

  try {
    const body = await request.json();
    const {
      rentmanProjectId,
      rentmanProjectNumber,
      rentmanProjectName,
      eventDate,
      templateId,
    } = body;

    const { data, error } = await supabase.rpc('create_project_checklist', {
      p_rentman_project_id: Number(rentmanProjectId),
      p_rentman_project_number: String(rentmanProjectNumber ?? ''),
      p_rentman_project_name: String(rentmanProjectName ?? ''),
      p_event_date: eventDate || null,
      p_template_id: Number(templateId),
    });

    if (error) throw error;
    return NextResponse.json({ ok: true, checklistId: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checklist kon niet worden aangemaakt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
