import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanningProjectFunctionsForProject } from '@/lib/rentman';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireModulePermission('billing', 'view');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Ongeldig project' }, { status: 400 });
  const admin = createAdminClient();
  const { data: item } = await admin.from('billing_items').select('rentman_project_id').eq('id', id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Project niet gevonden' }, { status: 404 });
  if (!item.rentman_project_id) return NextResponse.json({ rows: [], warning: 'Geen Rentman-project gekoppeld' });
  try {
    const functions = await getPlanningProjectFunctionsForProject(Number(item.rentman_project_id));
    const rows = functions.map(f => {
      const start = f.planperiod_start ? Date.parse(f.planperiod_start) : NaN;
      const end = f.planperiod_end ? Date.parse(f.planperiod_end) : NaN;
      const hours = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 36000) / 100 : null;
      return { id: f.id, name: f.displayname || f.name || 'Personeelsfunctie', amount: f.amount ?? 1, hoursPerPerson: hours, plannedHours: hours === null ? null : Math.round(hours * (f.amount ?? 1) * 100) / 100 };
    });
    return NextResponse.json({ rows, source: 'rentman', recordedConnected: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Rentman-uren ophalen mislukt' }, { status: 502 });
  }
}
