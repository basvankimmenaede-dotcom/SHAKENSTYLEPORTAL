import { createAdminClient } from '@/lib/supabase/admin';

export type PlanningTaskArea = 'office' | 'warehouse' | 'both';

export class PlanningTaskAssigneeError extends Error {}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAssigneeProfileIds(body: Record<string, unknown>): string[] {
  const raw = body.assigneeProfileIds === undefined
    ? (body.assigneeProfileId ? [body.assigneeProfileId] : [])
    : body.assigneeProfileIds;

  if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) {
    throw new PlanningTaskAssigneeError('Ongeldige selectie van medewerkers.');
  }

  const ids = Array.from(new Set(raw.map((id: string) => id.trim()).filter(Boolean)));
  if (ids.length > 30 || ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new PlanningTaskAssigneeError('Ongeldige selectie van medewerkers.');
  }
  return ids;
}

export async function validateAssigneeProfileIds(
  ids: string[],
  taskArea: PlanningTaskArea,
): Promise<void> {
  if (!ids.length) return;

  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id,role')
    .in('id', ids)
    .in('role', ['admin', 'warehouse']);

  if (error) throw error;
  if (!data || data.length !== ids.length) {
    throw new PlanningTaskAssigneeError('Een of meer medewerkers kunnen niet aan taken worden toegewezen.');
  }

  if (taskArea === 'office' && data.some((person) => person.role === 'warehouse')) {
    throw new PlanningTaskAssigneeError('Een kantoortaak kan niet aan een magazijngebruiker worden toegewezen.');
  }
}

export function storedAssigneeIds(row: {
  assignee_profile_ids?: string[] | null;
  assignee_profile_id?: string | null;
} | null): string[] {
  if (!row) return [];
  return row.assignee_profile_ids?.length
    ? row.assignee_profile_ids
    : row.assignee_profile_id ? [row.assignee_profile_id] : [];
}
