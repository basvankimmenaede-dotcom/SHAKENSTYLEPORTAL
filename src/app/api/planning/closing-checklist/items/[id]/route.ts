import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await requireModulePermission('checklists', 'manage');
  const { id } = await params;

  try {
    const itemId = Number(id);
    const body = await request.json();
    const completed = Boolean(body.completed);

    const { data: item, error: readError } = await supabase
      .from('closing_checklist_items')
      .select('id,closing_checklist_id')
      .eq('id', itemId)
      .single();
    if (readError) throw readError;

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('closing_checklist_items')
      .update({
        completed,
        completed_at: completed ? now : null,
        completed_by: completed ? user.id : null,
        updated_at: now,
      })
      .eq('id', itemId);
    if (updateError) throw updateError;

    const { data: siblings, error: siblingsError } = await supabase
      .from('closing_checklist_items')
      .select('completed')
      .eq('closing_checklist_id', item.closing_checklist_id);
    if (siblingsError) throw siblingsError;

    const allDone = Boolean(siblings?.length) && siblings.every((row) => row.completed);
    const { error: listError } = await supabase
      .from('closing_checklists')
      .update({
        status: allDone ? 'completed' : 'open',
        completed_at: allDone ? now : null,
        completed_by: allDone ? user.id : null,
      })
      .eq('id', item.closing_checklist_id);
    if (listError) throw listError;

    return NextResponse.json({ ok: true, allDone });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Afsluitlijst kon niet worden bijgewerkt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
