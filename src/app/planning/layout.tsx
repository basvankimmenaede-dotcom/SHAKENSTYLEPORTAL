import PlanningShell from '@/components/PlanningShell';
import { requireAdmin } from '@/lib/auth';

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <PlanningShell>{children}</PlanningShell>;
}
