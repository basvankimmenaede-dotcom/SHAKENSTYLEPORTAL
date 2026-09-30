import PlanningShell from '@/components/PlanningShell';
import { getUserPermissionLevel, permissionAtLeast, requirePlanningUser } from '@/lib/auth';

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase, user } = await requirePlanningUser();
  const portalLevel = profile.role === 'admin'
    ? 'manage'
    : await getUserPermissionLevel(supabase, user.id, 'portal');
  const canViewPortal = profile.role === 'admin' || permissionAtLeast(portalLevel, 'view');

  return <PlanningShell role={profile.role} canViewPortal={canViewPortal} userLabel={profile.full_name}>{children}</PlanningShell>;
}
