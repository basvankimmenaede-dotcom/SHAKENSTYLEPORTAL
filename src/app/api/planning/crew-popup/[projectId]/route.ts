import { NextResponse } from 'next/server';
import { requirePlanningUser } from '@/lib/auth';
import {
  getPlanningProjectFunctionGroupsForProject,
  getPlanningProjectFunctionsForProject,
  getPlanningProjectVehiclesForProject,
} from '@/lib/rentman';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  await requirePlanningUser();

  const { projectId: rawProjectId } = await params;
  const projectId = Number(rawProjectId);

  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ ok: false, error: 'Ongeldig project.' }, { status: 400 });
  }

  try {
    const [groups, functions, vehicles] = await Promise.all([
      getPlanningProjectFunctionGroupsForProject(projectId),
      getPlanningProjectFunctionsForProject(projectId),
      getPlanningProjectVehiclesForProject(projectId),
    ]);

    return NextResponse.json({ ok: true, groups, functions, vehicles });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Projectdetails konden niet worden geladen.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
