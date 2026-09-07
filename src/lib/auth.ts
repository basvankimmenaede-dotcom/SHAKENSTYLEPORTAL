import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type PortalProfile = {
  id: string;
  role: 'admin' | 'customer';
  full_name: string | null;
  distributor_id: number | null;
};

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawProfile } = await supabase
    .from('profiles')
    .select('id, role, full_name, distributor_id')
    .eq('id', user.id)
    .single();

  if (!rawProfile) redirect('/login?error=profile');
  const profile = rawProfile as PortalProfile;
  return { user, profile, supabase };
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.profile.role !== 'admin') redirect('/portal');
  return session;
}
