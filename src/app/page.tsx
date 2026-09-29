import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserPermissionLevel, permissionAtLeast } from '@/lib/auth';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'admin') redirect('/admin');

  const [planningLevel, portalLevel] = await Promise.all([
    getUserPermissionLevel(supabase, user.id, 'planning'),
    getUserPermissionLevel(supabase, user.id, 'portal'),
  ]);

  if (permissionAtLeast(planningLevel, 'view')) redirect('/planning');
  if (permissionAtLeast(portalLevel, 'view')) redirect('/portal');

  redirect('/account');
}
