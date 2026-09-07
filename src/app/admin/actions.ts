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
  revalidatePath('/portal');
}

export async function setDistributorBrand(formData: FormData) {
  const { supabase } = await requireAdmin();
  const distributorId = Number(formData.get('distributor_id'));
  const brandId = Number(formData.get('brand_id'));
  const enabled = formData.get('enabled') === 'on';
  if (!Number.isFinite(distributorId) || !Number.isFinite(brandId)) return;

  if (enabled) {
    await supabase.from('distributor_brands').upsert({ distributor_id: distributorId, brand_id: brandId });
  } else {
    await supabase.from('distributor_brands').delete().eq('distributor_id', distributorId).eq('brand_id', brandId);
  }

  revalidatePath('/admin/distributors');
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
}

export async function inviteCustomer(formData: FormData) {
  await requireAdmin();
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const distributorRaw = String(formData.get('distributor_id') ?? '');
  const distributorId = distributorRaw ? Number(distributorRaw) : null;
  if (!email || !distributorId) return;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: email },
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
