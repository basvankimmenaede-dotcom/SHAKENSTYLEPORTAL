import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import UsersManager from '@/components/UsersManager';
import UsersManagerEnhancements from '@/components/UsersManagerEnhancements';

const permissionKeys = ['portal', 'planning', 'tasks', 'billing', 'checklists', 'user_admin'] as const;
type PermissionKey = typeof permissionKeys[number];
type PermissionLevel = 'none' | 'own' | 'view' | 'manage';

export default async function UsersPage() {
  const session = await requireAdmin();
  const admin = createAdminClient();

  const [
    { data: userList },
    { data: profiles },
    { data: distributors },
    { data: brands },
    { data: accessRows },
    { data: distributorBrandRows },
    { data: permissionRows },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from('profiles').select('id,full_name,role,distributor_id'),
    admin.from('distributors').select('id,name').order('name'),
    admin
      .from('brands')
      .select('id,name,rentman_name,portal_enabled,is_brand,rentman_active')
      .eq('is_brand', true)
      .eq('rentman_active', true)
      .eq('portal_enabled', true)
      .order('name'),
    admin.from('user_brand_access').select('user_id,brand_id'),
    admin.from('distributor_brands').select('distributor_id,brand_id'),
    admin.from('user_permissions').select('user_id,permission_key,access_level'),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [String(profile.id), profile]));
  const distributorById = new Map((distributors ?? []).map((distributor) => [Number(distributor.id), String(distributor.name)]));
  const accessByUser = new Map<string, Set<number>>();
  const permissionByUser = new Map<string, Map<PermissionKey, PermissionLevel>>();
  const brandsByDistributor = new Map<number, Set<number>>();

  for (const row of distributorBrandRows ?? []) {
    const distributorId = Number(row.distributor_id);
    if (!brandsByDistributor.has(distributorId)) brandsByDistributor.set(distributorId, new Set());
    brandsByDistributor.get(distributorId)?.add(Number(row.brand_id));
  }

  for (const row of accessRows ?? []) {
    const userId = String(row.user_id);
    if (!accessByUser.has(userId)) accessByUser.set(userId, new Set());
    accessByUser.get(userId)?.add(Number(row.brand_id));
  }

  for (const row of permissionRows ?? []) {
    const key = String(row.permission_key) as PermissionKey;
    const level = String(row.access_level) as PermissionLevel;
    if (!permissionKeys.includes(key) || !['none', 'own', 'view', 'manage'].includes(level)) continue;
    const userId = String(row.user_id);
    if (!permissionByUser.has(userId)) permissionByUser.set(userId, new Map());
    permissionByUser.get(userId)?.set(key, level);
  }

  const activeBrands = (brands ?? []).map((brand) => ({
    id: Number(brand.id),
    name: String(brand.name),
    rentman_name: brand.rentman_name ? String(brand.rentman_name) : null,
    portal_enabled: Boolean(brand.portal_enabled),
  }));

  const users = (userList?.users ?? []).map((authUser) => {
    const id = String(authUser.id);
    const profile = profileById.get(id);
    const role = profile?.role === 'admin' || profile?.role === 'warehouse' ? profile.role : 'customer';
    const distributorId = profile?.distributor_id ? Number(profile.distributor_id) : null;
    const assigned = Array.from(accessByUser.get(id) ?? []);
    const assignedSet = new Set(assigned);
    const distributorBrandIds = distributorId ? (brandsByDistributor.get(distributorId) ?? new Set<number>()) : new Set<number>();
    const availableBrandIds = role === 'customer'
      ? activeBrands
          .filter((brand) => distributorBrandIds.has(brand.id) || assignedSet.has(brand.id))
          .map((brand) => brand.id)
      : activeBrands.map((brand) => brand.id);

    const permissions = Object.fromEntries(
      permissionKeys.map((key) => [
        key,
        role === 'admin'
          ? 'manage'
          : permissionByUser.get(id)?.get(key) ?? 'none',
      ]),
    ) as Record<PermissionKey, PermissionLevel>;

    return {
      id,
      email: authUser.email ?? profile?.full_name ?? id,
      fullName: profile?.full_name ? String(profile.full_name) : null,
      role,
      distributorId,
      distributorName: distributorId ? distributorById.get(distributorId) ?? null : null,
      assignedBrandIds: assigned,
      availableBrandIds,
      permissions,
      invitedAt: authUser.invited_at ?? null,
      confirmedAt: authUser.confirmed_at ?? null,
      lastSignInAt: authUser.last_sign_in_at ?? null,
    };
  });

  users.sort((a, b) => {
    if (a.id === session.user.id) return -1;
    if (b.id === session.user.id) return 1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    return a.email.localeCompare(b.email, 'nl');
  });

  return (
    <>
      <UsersManagerEnhancements />
      <UsersManager
      users={users}
      distributors={(distributors ?? []).map((distributor) => ({
        id: Number(distributor.id),
        name: String(distributor.name),
      }))}
      brands={activeBrands}
      currentUserId={session.user.id}
      />
    </>
  );
}
