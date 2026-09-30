import { requireAdmin } from '@/lib/auth';
import { getRentmanProjectTypes } from '@/lib/rentman';
import ChecklistTemplatesManager from '@/components/ChecklistTemplatesManager';

type TemplateItem = {
  id: number;
  label: string;
  sort_order: number;
  is_required: boolean;
  deadline_offset_days: number | null;
  task_area: 'office' | 'warehouse' | 'both';
};

type Template = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  rentman_project_type_id: number | null;
  rentman_project_type_name: string | null;
  checklist_template_items: TemplateItem[];
};

export default async function ChecklistTemplatesPage() {
  const { supabase } = await requireAdmin();

  const [{ data, error }, projectTypes] = await Promise.all([
    supabase
      .from('checklist_templates')
      .select('id,name,description,is_active,rentman_project_type_id,rentman_project_type_name,checklist_template_items(id,label,sort_order,is_required,deadline_offset_days,task_area)')
      .order('name'),
    getRentmanProjectTypes(),
  ]);

  if (error) throw new Error(error.message);

  const templates = ((data ?? []) as Template[]).map((template) => ({
    ...template,
    checklist_template_items: [...(template.checklist_template_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
  }));

  return (
    <ChecklistTemplatesManager
      templates={templates}
      projectTypes={projectTypes.map((type) => ({ id: type.id, name: type.name }))}
    />
  );
}
