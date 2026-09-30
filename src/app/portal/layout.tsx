import AppShell from '@/components/AppShell';
import { getUserPermissionLevel, permissionAtLeast, requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await requireUser();

  const [portalLevel, planningLevel, billingLevel, checklistLevel] = profile.role === 'admin'
    ? ['manage', 'manage', 'manage', 'manage'] as const
    : await Promise.all([
        getUserPermissionLevel(supabase, user.id, 'portal'),
        getUserPermissionLevel(supabase, user.id, 'planning'),
        getUserPermissionLevel(supabase, user.id, 'billing'),
        getUserPermissionLevel(supabase, user.id, 'checklists'),
      ]);

  const canViewPortal = profile.role === 'admin' || permissionAtLeast(portalLevel, 'view');
  const canViewPlanning = profile.role === 'admin' || permissionAtLeast(planningLevel, 'view');
  const canViewBilling = profile.role === 'admin' || permissionAtLeast(billingLevel, 'view');
  const canViewChecklists = profile.role === 'admin' || permissionAtLeast(checklistLevel, 'view');

  if (!canViewPortal) redirect('/');

  let portalLabel = profile.role === 'admin' ? 'Alle merken' : 'Portaal';

  if (profile.role !== 'admin' && profile.distributor_id) {
    const { data: distributor } = await supabase
      .from('distributors')
      .select('name')
      .eq('id', profile.distributor_id)
      .single();
    if (distributor?.name) portalLabel = distributor.name;
  }

  return (
    <AppShell
      role={profile.role}
      admin={profile.role === 'admin'}
      adminPreview={profile.role === 'admin'}
      portalLabel={portalLabel}
      userLabel={profile.full_name}
      canViewPortal={canViewPortal}
      canViewPlanning={canViewPlanning}
      canViewBilling={canViewBilling}
      canViewChecklists={canViewChecklists}
    >
      {children}
    </AppShell>
  );
}
