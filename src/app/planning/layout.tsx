import PlanningShell from '@/components/PlanningShell';
import { getUserPermissionLevel, permissionAtLeast, requirePlanningUser } from '@/lib/auth';

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase, user } = await requirePlanningUser();

  const [portalLevel, billingLevel, checklistLevel] = profile.role === 'admin'
    ? ['manage', 'manage', 'manage'] as const
    : await Promise.all([
        getUserPermissionLevel(supabase, user.id, 'portal'),
        getUserPermissionLevel(supabase, user.id, 'billing'),
        getUserPermissionLevel(supabase, user.id, 'checklists'),
      ]);

  const canViewPortal = profile.role === 'admin' || permissionAtLeast(portalLevel, 'view');
  const canViewBilling = profile.role === 'admin' || permissionAtLeast(billingLevel, 'view');
  const canViewChecklists = profile.role === 'admin' || permissionAtLeast(checklistLevel, 'view');

  return (
    <PlanningShell
      role={profile.role}
      canViewPortal={canViewPortal}
      canViewBilling={canViewBilling}
      canViewChecklists={canViewChecklists}
      userLabel={profile.full_name}
    >
      {children}
    </PlanningShell>
  );
}
