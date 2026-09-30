import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { completePlanningTodoistTask } from '@/lib/todoist';

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
      .select('id,closing_checklist_id,item_type')
      .eq('id', itemId)
      .single();
    if (readError) throw readError;

    if (item.item_type === 'heading') {
      return NextResponse.json({ ok: false, error: 'Een kop kan niet worden afgevinkt.' }, { status: 400 });
    }

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
      .select('completed,item_type')
      .eq('closing_checklist_id', item.closing_checklist_id);
    if (siblingsError) throw siblingsError;

    const actionableSiblings = (siblings ?? []).filter((row) => row.item_type !== 'heading');
    const allDone = Boolean(actionableSiblings.length) && actionableSiblings.every((row) => row.completed);
    const { data: list, error: listReadError } = await supabase
      .from('closing_checklists')
      .select('todoist_task_id')
      .eq('id', item.closing_checklist_id)
      .single();
    if (listReadError) throw listReadError;

    let todoistTaskId = list?.todoist_task_id ?? null;
    if (allDone && todoistTaskId) {
      try {
        await completePlanningTodoistTask(String(todoistTaskId));
        todoistTaskId = null;
      } catch {
        // Keep the link so the planning page can retry if Todoist is temporarily unavailable.
      }
    }

    const { error: listError } = await supabase
      .from('closing_checklists')
      .update({
        status: allDone ? 'completed' : 'open',
        completed_at: allDone ? now : null,
        completed_by: allDone ? user.id : null,
        todoist_task_id: todoistTaskId,
      })
      .eq('id', item.closing_checklist_id);
    if (listError) throw listError;

    return NextResponse.json({ ok: true, allDone });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Afsluitlijst kon niet worden bijgewerkt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
