import type { SupabaseClient } from '@supabase/supabase-js';
import type { RentmanPlanningEquipmentGroup, RentmanPlanningProject } from '@/lib/rentman';

export type BillingStatus = 'open' | 'invoiced' | 'skip';

const BILLING_QUEUE_START_DATE = '2026-09-29';

export function amsterdamBillingDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function billingSyncNeeded(supabase: SupabaseClient, today = amsterdamBillingDateKey()) {
  const { data, error } = await supabase
    .from('billing_sync_state')
    .select('last_sync_date')
    .eq('id', 'rentman')
    .maybeSingle();

  if (error) throw error;
  return data?.last_sync_date !== today;
}

export async function markBillingSynced(
  supabase: SupabaseClient,
  userId: string,
  today = amsterdamBillingDateKey(),
) {
  const { error } = await supabase
    .from('billing_sync_state')
    .upsert({
      id: 'rentman',
      last_sync_date: today,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    }, { onConflict: 'id' });

  if (error) throw error;
}

export function billingUsageRange(
  project: RentmanPlanningProject,
  equipmentGroupsByProjectId: Map<number, RentmanPlanningEquipmentGroup[]>,
) {
  const groups = equipmentGroupsByProjectId.get(project.id) ?? [];
  const usable = groups.filter((group) => group.usageperiod_start && group.usageperiod_end);

  if (usable.length) {
    const counts = new Map<string, { start: string; end: string; count: number }>();
    for (const group of usable) {
      const start = String(group.usageperiod_start);
      const end = String(group.usageperiod_end);
      const key = `${start}|${end}`;
      const current = counts.get(key);
      counts.set(key, current ? { ...current, count: current.count + 1 } : { start, end, count: 1 });
    }

    const selected = Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.start.localeCompare(b.start))[0];

    if (selected) return { start: selected.start, end: selected.end };
  }

  const start = project.usageperiod_start ?? project.planperiod_start ?? null;
  const end = project.usageperiod_end ?? start;
  return { start, end };
}

export async function syncBillingQueueFromPlanning({
  supabase,
  projects,
  equipmentGroups,
  userId,
}: {
  supabase: SupabaseClient;
  projects: RentmanPlanningProject[];
  equipmentGroups: RentmanPlanningEquipmentGroup[];
  userId: string;
}) {
  const equipmentGroupsByProjectId = new Map<number, RentmanPlanningEquipmentGroup[]>();
  for (const group of equipmentGroups) {
    const projectId = Number(group.project?.split('/').pop());
    if (!Number.isFinite(projectId)) continue;
    const current = equipmentGroupsByProjectId.get(projectId) ?? [];
    current.push(group);
    equipmentGroupsByProjectId.set(projectId, current);
  }

  const candidates = projects
    .filter((project) => !project.is_cancelled)
    .map((project) => ({ project, range: billingUsageRange(project, equipmentGroupsByProjectId) }))
    .filter(({ range }) =>
      Boolean(range.end)
      && String(range.end).slice(0, 10) >= BILLING_QUEUE_START_DATE
      && new Date(String(range.end)).getTime() <= Date.now()
    );

  if (!candidates.length) return 0;

  const ids = candidates.map(({ project }) => project.id);
  const { data: existing, error: existingError } = await supabase
    .from('billing_items')
    .select('rentman_project_id')
    .in('rentman_project_id', ids);

  if (existingError) throw existingError;

  const existingIds = new Set((existing ?? []).map((row) => Number(row.rentman_project_id)));
  const rows = candidates
    .filter(({ project }) => !existingIds.has(project.id))
    .map(({ project, range }) => ({
      source_type: 'rentman',
      rentman_project_id: project.id,
      rentman_project_number: project.number ? String(project.number) : null,
      project_name: project.name,
      customer_name: project.customer?.displayname ?? project.customer?.name ?? null,
      usage_start: range.start,
      usage_end: range.end,
      status: 'open',
      created_by: userId,
    }));

  if (!rows.length) return 0;

  const { error } = await supabase.from('billing_items').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function syncBillingQueueOncePerDay({
  supabase,
  projects,
  equipmentGroups,
  userId,
  today = amsterdamBillingDateKey(),
}: {
  supabase: SupabaseClient;
  projects: RentmanPlanningProject[];
  equipmentGroups: RentmanPlanningEquipmentGroup[];
  userId: string;
  today?: string;
}) {
  const needed = await billingSyncNeeded(supabase, today);
  if (!needed) return { ran: false, added: 0 };

  const added = await syncBillingQueueFromPlanning({
    supabase,
    projects,
    equipmentGroups,
    userId,
  });

  await markBillingSynced(supabase, userId, today);
  return { ran: true, added };
}
