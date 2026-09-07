import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getRootEquipmentFolderMap } from '@/lib/rentman';
import { getAccessibleBrandIds, resolvePortalAccessContext, withPreview } from '@/lib/portal-access';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const { user, profile } = await requireUser();
  const admin = createAdminClient();
  const query = searchParams ? await searchParams : {};
  const previewUserId = query.as ?? null;
  const access = await resolvePortalAccessContext({
    currentProfile: profile,
    currentUserId: user.id,
    previewUserId,
  });

  const effectiveProfile = access.effectiveProfile;
  const accessibleBrandIds = await getAccessibleBrandIds({
    currentProfile: profile,
    effectiveUserId: access.effectiveUserId,
    previewing: access.previewing,
  });

  let distributorName = profile.role === 'admin' && !access.previewing ? 'Alle merken' : 'Portaal';
  if (effectiveProfile.distributor_id) {
    const { data: distributor } = await admin
      .from('distributors')
      .select('name')
      .eq('id', effectiveProfile.distributor_id)
      .single();
    if (distributor?.name) distributorName = distributor.name;
  }

  let brandQuery = admin
    .from('brands')
    .select('id,name,rentman_folder_id,rentman_path')
    .eq('portal_enabled', true)
    .eq('is_brand', true)
    .eq('rentman_active', true)
    .order('name');

  if (accessibleBrandIds !== null) {
    if (accessibleBrandIds.length === 0) {
      return (
        <main className="container">
          {access.previewing ? (
            <div className="previewBanner pagePreviewBanner">
              Gebruikersweergave: {access.previewLabel} · <Link href="/admin/users">Terug naar gebruikers</Link>
            </div>
          ) : null}
          <section className="hero">
            <div>
              <h1>{distributorName}</h1>
              <p>Bekijk de opgeslagen materialen die SHAKENSTYLE voor jouw organisatie beheert.</p>
            </div>
          </section>
          <div className="notice">Er zijn nog geen merken aan dit account toegewezen.</div>
        </main>
      );
    }
    brandQuery = brandQuery.in('id', accessibleBrandIds);
  }

  const { data: brands } = await brandQuery;

  let liveFolders = new Map<number, { id: number; name: string; parent: string | null; path?: string }>();
  try {
    liveFolders = await getRootEquipmentFolderMap();
  } catch {
    // Supabase blijft fallback als de beheerverbinding tijdelijk niet beschikbaar is.
  }

  const displayBrands = (brands ?? []).map((brand) => {
    const folder = brand.rentman_folder_id ? liveFolders.get(brand.rentman_folder_id) : undefined;
    return {
      ...brand,
      displayName: folder?.name ?? brand.name,
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl'));

  return (
    <main className="container">
      {access.previewing ? (
        <div className="previewBanner pagePreviewBanner">
          Gebruikersweergave: {access.previewLabel} · <Link href="/admin/users">Terug naar gebruikers</Link>
        </div>
      ) : null}

      <section className="hero">
        <div>
          <h1>{distributorName}</h1>
          <p>Bekijk de opgeslagen materialen die SHAKENSTYLE voor jouw organisatie beheert.</p>
        </div>
      </section>

      {displayBrands.length === 0 ? (
        <div className="notice">Er zijn nog geen merken aan dit account toegewezen.</div>
      ) : (
        <section className="brandGrid">
          {displayBrands.map((brand) => (
            <Link href={withPreview(`/portal/brand/${brand.id}`, access.previewing ? access.effectiveUserId : null)} className="brandCard" key={brand.id}>
              <div>
                <h2>{brand.displayName}</h2>
                <p className="muted">Opgeslagen materialen</p>
              </div>
              <strong>Bekijk voorraad &rarr;</strong>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
