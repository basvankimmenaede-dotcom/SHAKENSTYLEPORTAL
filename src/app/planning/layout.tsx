import PlanningShell from '@/components/PlanningShell';
import { requirePlanningUser } from '@/lib/auth';

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requirePlanningUser();
  return <PlanningShell role={profile.role}>{children}</PlanningShell>;
}
