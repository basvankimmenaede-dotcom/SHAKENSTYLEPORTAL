import AppShell from '@/components/AppShell';
import { requireAdmin } from '@/lib/auth';

// Preview environment redeploy marker
export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AppShell admin>{children}</AppShell>;
}
