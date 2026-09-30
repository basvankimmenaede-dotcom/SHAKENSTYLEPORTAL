import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import { createPlanningTodoistTask } from '@/lib/todoist';

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

    const checklistId = Number(data);
    const { data: items, error: itemsError } = await supabase
      .from('project_checklist_items')
      .select('id,label,due_date,todoist_task_id,is_required,task_area')
      .eq('project_checklist_id', checklistId)
      .eq('is_required', true)
      .is('todoist_task_id', null);

    if (itemsError) throw itemsError;

    const todoistErrors: string[] = [];
    for (const item of items ?? []) {
      try {
        const task = await createPlanningTodoistTask({
          content: `${rentmanProjectNumber} ${item.label}`,
          dueDate: item.due_date ? String(item.due_date) : null,
          description: `Automatisch aangemaakt vanuit SHAKENSTYLE checklist · project ${rentmanProjectNumber} · checklist-item ${item.id}`,
        });

        const taskArea = item.task_area === 'office' || item.task_area === 'warehouse' ? item.task_area : 'both';

        const { error: updateError } = await supabase
          .from('project_checklist_items')
          .update({ todoist_task_id: task.id })
          .eq('id', item.id);

        if (updateError) throw updateError;

        const { error: assignmentError } = await supabase
          .from('planning_task_assignments')
          .upsert({
            todoist_task_id: task.id,
            assignee_profile_id: null,
            task_area: taskArea,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'todoist_task_id' });

        if (assignmentError) throw assignmentError;
      } catch (todoistError) {
        todoistErrors.push(
          todoistError instanceof Error ? todoistError.message : `Taak voor ${item.label} kon niet worden aangemaakt.`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      checklistId,
      todoistCreated: (items?.length ?? 0) - todoistErrors.length,
      todoistErrors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checklist kon niet worden aangemaakt.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
