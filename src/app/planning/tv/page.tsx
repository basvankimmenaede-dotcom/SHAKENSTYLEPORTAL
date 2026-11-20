import type { Metadata } from 'next';
import { requirePlanningUser } from '@/lib/auth';
import { getTvAgendaSnapshot } from '@/lib/rentman-planning-tv';
import PlanningTvDashboard from '@/components/PlanningTvDashboard';

export const metadata: Metadata = { title: 'TV agenda · SHAKENSTYLE' };
export const dynamic = 'force-dynamic';

export default async function PlanningTvPage() {
  // Layouts and pages can render concurrently. Authorize before loading Rentman.
  await requirePlanningUser();
  try {
    const snapshot = await getTvAgendaSnapshot();
    return <PlanningTvDashboard initialSnapshot={snapshot} />;
  } catch {
    return <PlanningTvDashboard initialSnapshot={null} initialError="De agenda kan nog niet uit Rentman worden geladen. We proberen het automatisch opnieuw." />;
  }
}
