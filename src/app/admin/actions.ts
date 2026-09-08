'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';

export async function createDistributor(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  await supabase.from('distributors').insert({ name });
  revalidatePath('/admin/distributors');
}

export async function updateBrandSettings(formData: FormData) {
  const { supabase } = await requireAdmin();
  const brandId = Number(formData.get('brand_id'));
  const portalEnabled = formData.get('portal_enabled') === 'on';
  const isBrand = formData.get('is_brand') === 'on';
  if (!Number.isFinite(brandId)) return;

  await supabase.from('brands').update({ portal_enabled: portalEnabled, is_brand: isBrand }).eq('id', brandId);
  revalidatePath('/admin/brands');
  revalidatePath('/admin/users');
  revalidatePath('/portal');
}

export async function assignUserProfile(formData: FormData) {
  await requireAdmin();
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const userId = String(formData.get('user_id') ?? '');
  const distributorRaw = String(formData.get('distributor_id') ?? '');
  const role = String(formData.get('role') ?? 'customer');
  const distributorId = distributorRaw ? Number(distributorRaw) : null;

  if (!userId || !['admin', 'customer'].includes(role)) return;

  await admin
    .from('profiles')
    .update({
      role,
      distributor_id: role === 'admin' ? null : distributorId,
    })
    .eq('id', userId);

  revalidatePath('/admin/users');
  revalidatePath('/portal');
}

export async function saveUserBrandAccess(formData: FormData) {
  await requireAdmin();
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const userId = String(formData.get('user_id') ?? '').trim();
  const selectedBrandIds = formData
    .getAll('brand_ids')
    .map((value) => Number(value))
    .filter(Number.isFinite);

  if (!userId) return;

  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (!profile || profile.role === 'admin') return;

  const { error: deleteError } = await admin.from('user_brand_access').delete().eq('user_id', userId);
  if (deleteError) throw new Error(deleteError.message);

  if (selectedBrandIds.length > 0) {
    const rows = selectedBrandIds.map((brandId) => ({ user_id: userId, brand_id: brandId }));
    const { error: insertError } = await admin.from('user_brand_access').insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath('/admin/users');
  revalidatePath('/portal');
}

export async function inviteCustomer(formData: FormData) {
  await requireAdmin();
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const distributorRaw = String(formData.get('distributor_id') ?? '');
  const distributorId = distributorRaw ? Number(distributorRaw) : null;
  if (!email || !distributorId) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://portal.shakenstyle.com').replace(/\/$/, '');
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: email },
    redirectTo: `${appUrl}/accept-invite`,
  });
  if (error) throw new Error(error.message);

  if (data.user?.id) {
    await admin.from('profiles').upsert({
      id: data.user.id,
      full_name: email,
      role: 'customer',
      distributor_id: distributorId,
    });
  }

  revalidatePath('/admin/users');
}
