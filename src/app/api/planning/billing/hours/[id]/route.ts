import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanningProjectFunctionsForProject, getPlanningCrewAssignmentsForProject } from '@/lib/rentman';
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
    const [functions, projectCrew] = await Promise.all([getPlanningProjectFunctionsForProject(Number(item.rentman_project_id)), getPlanningCrewAssignmentsForProject(Number(item.rentman_project_id))]);
    const functionByCrewId = new Map(projectCrew.map(crew => [crew.id, crew.function?.id ?? null]));
    const rows = functions.map(f => {
      const start = f.planperiod_start ? Date.parse(f.planperiod_start) : NaN;
      const end = f.planperiod_end ? Date.parse(f.planperiod_end) : NaN;
      const hours = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 36000) / 100 : null;
      return { id: f.id, type: f.type ?? null, name: f.displayname || f.name || 'Personeelsfunctie', group: f.group?.displayname || f.group?.name || f.displayname || f.name || 'Overig', startsAt: f.planperiod_start ?? null, endsAt: f.planperiod_end ?? null, amount: f.amount ?? 1, hoursPerPerson: hours, plannedHours: hours === null ? null : Math.round(hours * (f.amount ?? 1) * 100) / 100 };
    });
    const { data: assignments, error: assignmentError } = await admin.from('crew_portal_assignments')
      .select('id,crew_member_id,starts_at,ends_at,rentman_projectcrew_id')
      .eq('rentman_project_id', Number(item.rentman_project_id));
    if (assignmentError) throw new Error('Diensten ophalen mislukt: ' + assignmentError.message);
    const ids = (assignments ?? []).map(a => a.id);
    const { data: reports, error: reportError } = ids.length
      ? await admin.from('crew_shift_reports').select('id,assignment_id,work_started_at,work_ended_at,break_minutes,travel_minutes,expenses_amount,expenses_description,notes,breakage_over_ten,missing_materials,missing_materials_description,status').in('assignment_id', ids)
      : { data: [], error: null };
    if (reportError) throw new Error('Sheets ophalen mislukt: ' + reportError.message);
    const assignmentById = new Map((assignments ?? []).map(a => [a.id, a]));
    // Fetch the exact projectcrew records for submitted sheets when the project-wide
    // lookup did not expose their expanded function. Never guess a function by time.
    const missingCrewIds = [...new Set((assignments ?? [])
      .filter(a => !functionByCrewId.has(Number(a.rentman_projectcrew_id)))
      .map(a => Number(a.rentman_projectcrew_id))
      .filter(Number.isSafeInteger))];
    await Promise.all(missingCrewIds.map(async crewId => {
      try {
        const response = await fetch(`https://api.rentman.net/projectcrew/${crewId}?fields=id,function&expand=function`, {
          headers: { Authorization: `Bearer ${process.env.RENTMAN_API_TOKEN}`, Accept: 'application/json' },
          next: { revalidate: 30 },
        });
        if (!response.ok) return;
        const payload = await response.json();
        const fn = payload?.data?.function;
        const functionId = typeof fn === 'number' ? fn : typeof fn === 'string' ? Number(fn.match(/(\\d+)$/)?.[1]) : Number(fn?.id);
        if (Number.isSafeInteger(functionId) && functions.some(f => f.id === functionId)) functionByCrewId.set(crewId, functionId);
      } catch (error) { console.error('Rentman function lookup failed for crew assignment', crewId, error); }
    }));
    const recorded = (reports ?? []).map(report => {
      const assignment = assignmentById.get(report.assignment_id);
      const start = Date.parse(report.work_started_at);
      const end = Date.parse(report.work_ended_at);
      const hours = Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? Math.round(Math.max(0, (end - start) / 60000 - Number(report.break_minutes || 0)) / 60 * 100) / 100 : null;
      return { id: report.id, assignmentId: report.assignment_id, crewMemberId: assignment?.crew_member_id, functionId: assignment ? functionByCrewId.get(Number(assignment.rentman_projectcrew_id)) ?? null : null, hours,
        plannedStartsAt: assignment?.starts_at ?? null, plannedEndsAt: assignment?.ends_at ?? null, workStartedAt: report.work_started_at, workEndedAt: report.work_ended_at, travelMinutes: report.travel_minutes, expensesAmount: report.expenses_amount, expensesDescription: report.expenses_description, notes: report.notes, breakageOverTen: report.breakage_over_ten,
        missingMaterials: report.missing_materials, missingMaterialsDescription: report.missing_materials_description, status: report.status };
    });
    return NextResponse.json({ rows, recorded, assignedCount: ids.length, source: 'rentman+crew_shift_reports', recordedConnected: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Rentman-uren ophalen mislukt' }, { status: 502 });
  }
}
