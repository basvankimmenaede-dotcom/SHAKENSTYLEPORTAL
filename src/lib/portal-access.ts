import { createAdminClient } from '@/lib/supabase/admin';
import type { PortalProfile } from '@/lib/auth';

export type PortalAccessContext = {
  effectiveUserId: string;
  effectiveProfile: PortalProfile;
  previewing: boolean;
  previewLabel: string | null;
};

export async function resolvePortalAccessContext({
  currentProfile,
  currentUserId,
  previewUserId,
}: {
  currentProfile: PortalProfile;
  currentUserId: string;
  previewUserId?: string | null;
}): Promise<PortalAccessContext> {
  if (currentProfile.role !== 'admin' || !previewUserId || previewUserId === currentUserId) {
    return {
      effectiveUserId: currentUserId,
      effectiveProfile: currentProfile,
      previewing: false,
      previewLabel: null,
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id,role,full_name,distributor_id')
    .eq('id', previewUserId)
    .maybeSingle();

  if (!profile || profile.role === 'admin') {
    return {
      effectiveUserId: currentUserId,
      effectiveProfile: currentProfile,
      previewing: false,
      previewLabel: null,
    };
  }

  const { data: authUser } = await admin.auth.admin.getUserById(previewUserId);
  return {
    effectiveUserId: previewUserId,
    effectiveProfile: profile as PortalProfile,
    previewing: true,
    previewLabel: authUser.user?.email ?? profile.full_name ?? 'klantgebruiker',
  };
}

export async function getAccessibleBrandIds({
  currentProfile,
  effectiveUserId,
  previewing,
}: {
  currentProfile: PortalProfile;
  effectiveUserId: string;
  previewing: boolean;
}): Promise<number[] | null> {
  // Admin without preview sees all portal brands.
  if (currentProfile.role === 'admin' && !previewing) return null;

  const client = createAdminClient();
  const { data, error } = await client
    .from('user_brand_access')
    .select('brand_id')
    .eq('user_id', effectiveUserId);

  if (error) throw new Error(`Gebruikersrechten konden niet worden geladen: ${error.message}`);
  return (data ?? []).map((row: { brand_id: number }) => Number(row.brand_id)).filter(Number.isFinite);
}

export function withPreview(path: string, previewUserId?: string | null) {
  if (!previewUserId) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}as=${encodeURIComponent(previewUserId)}`;
}
