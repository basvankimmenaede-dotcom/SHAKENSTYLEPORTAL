import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type PortalProfile = {
  id: string;
  role: 'admin' | 'customer' | 'warehouse';
  full_name: string | null;
  distributor_id: number | null;
};

export type PermissionKey = 'portal' | 'planning' | 'tasks' | 'billing' | 'checklists' | 'user_admin';
export type PermissionLevel = 'none' | 'own' | 'view' | 'manage';

const permissionRank: Record<PermissionLevel, number> = {
  none: 0,
  own: 1,
  view: 2,
  manage: 3,
};

export async function getUserPermissionLevel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  permissionKey: PermissionKey,
): Promise<PermissionLevel> {
  const { data } = await supabase
    .from('user_permissions')
    .select('access_level')
    .eq('user_id', userId)
    .eq('permission_key', permissionKey)
    .maybeSingle();

  const level = data?.access_level as PermissionLevel | undefined;
  return level && level in permissionRank ? level : 'none';
}

export function permissionAtLeast(current: PermissionLevel, required: PermissionLevel) {
  return permissionRank[current] >= permissionRank[required];
}

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


export async function requireModulePermission(
  permissionKey: PermissionKey,
  required: PermissionLevel = 'view',
) {
  const session = await requireUser();

  if (session.profile.role === 'admin') return session;

  const level = await getUserPermissionLevel(session.supabase, session.user.id, permissionKey);
  if (!permissionAtLeast(level, required)) {
    const portalLevel = await getUserPermissionLevel(session.supabase, session.user.id, 'portal');
    redirect(permissionAtLeast(portalLevel, 'view') ? '/portal' : '/');
  }

  return { ...session, permissionLevel: level };
}

export async function requirePlanningUser() {
  return requireModulePermission('planning', 'view');
}
