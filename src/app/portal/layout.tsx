import AppShell from '@/components/AppShell';
import { getUserPermissionLevel, permissionAtLeast, requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await requireUser();

  if (profile.role !== 'admin') {
    const portalLevel = await getUserPermissionLevel(supabase, user.id, 'portal');
    if (!permissionAtLeast(portalLevel, 'view')) redirect('/');
  }

  let portalLabel = profile.role === 'admin' ? 'Alle merken' : 'Portaal';

  if (profile.role !== 'admin' && profile.distributor_id) {
    const { data: distributor } = await supabase
      .from('distributors')
      .select('name')
      .eq('id', profile.distributor_id)
      .single();
    if (distributor?.name) portalLabel = distributor.name;
  }

  return <AppShell adminPreview={profile.role === 'admin'} portalLabel={portalLabel} userLabel={profile.full_name}>{children}</AppShell>;
}
