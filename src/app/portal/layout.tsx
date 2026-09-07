import AppShell from '@/components/AppShell';
import { requireUser } from '@/lib/auth';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireUser();
  let portalLabel = profile.role === 'admin' ? 'Alle merken' : 'Portaal';

  if (profile.role !== 'admin' && profile.distributor_id) {
    const { data: distributor } = await supabase
      .from('distributors')
      .select('name')
      .eq('id', profile.distributor_id)
      .single();
    if (distributor?.name) portalLabel = distributor.name;
  }

  return <AppShell adminPreview={profile.role === 'admin'} portalLabel={portalLabel}>{children}</AppShell>;
}
