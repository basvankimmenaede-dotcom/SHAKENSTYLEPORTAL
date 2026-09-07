import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getRootEquipmentFolderMap, getVisibleEquipmentForFolder } from '@/lib/rentman';
import EquipmentSearch from '@/components/EquipmentSearch';
import { getAccessibleBrandIds, resolvePortalAccessContext, withPreview } from '@/lib/portal-access';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ as?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const brandId = Number(id);
  if (!Number.isFinite(brandId)) notFound();

  const { user, profile } = await requireUser();
  const admin = createAdminClient();
  const access = await resolvePortalAccessContext({
    currentProfile: profile,
    currentUserId: user.id,
    previewUserId: query.as ?? null,
  });
  const accessibleBrandIds = await getAccessibleBrandIds({
    currentProfile: profile,
    effectiveUserId: access.effectiveUserId,
    previewing: access.previewing,
  });

  if (accessibleBrandIds !== null && !accessibleBrandIds.includes(brandId)) notFound();

  const { data: brand } = await admin
    .from('brands')
    .select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active')
    .eq('id', brandId)
    .eq('portal_enabled', true)
    .eq('is_brand', true)
    .eq('rentman_active', true)
    .single();
  if (!brand?.rentman_folder_id) notFound();

  let equipment: Awaited<ReturnType<typeof getVisibleEquipmentForFolder>> = { items: [], configured: false };
  let beheerError = '';
  let displayBrandName = brand.name;
  try {
    const [equipmentResult, folderMap] = await Promise.all([
      getVisibleEquipmentForFolder(brand.rentman_folder_id),
      getRootEquipmentFolderMap(),
    ]);
    equipment = equipmentResult;
    displayBrandName = folderMap.get(brand.rentman_folder_id)?.name ?? brand.name;
  } catch (error) {
    beheerError = error instanceof Error ? error.message : 'De beheergegevens konden niet worden geladen.';
  }

  return (
    <main className="container">
      {access.previewing ? (
        <div className="previewBanner pagePreviewBanner">Gebruikersweergave: {access.previewLabel}</div>
      ) : null}
      <section className="hero">
        <div>
          <Link className="eyebrowLink" href={withPreview('/portal', access.previewing ? access.effectiveUserId : null)}>← Terug</Link>
          <h1>{displayBrandName}</h1>
          <p>Bekijk de materialen die SHAKENSTYLE voor dit merk beheert.</p>
        </div>
      </section>

      {beheerError ? <div className="error">{beheerError}</div> : null}
      {!equipment.configured ? (
        <div className="notice">De zichtbaarheid voor materialen is nog niet geconfigureerd. Tot die tijd worden uit veiligheid geen items getoond.</div>
      ) : null}
      {equipment.configured && !beheerError && equipment.items.length === 0 ? (
        <div className="notice">Voor {displayBrandName} zijn op dit moment nog geen materialen zichtbaar in het portaal.</div>
      ) : null}

      {equipment.items.length > 0 ? <EquipmentSearch brandId={brand.id} items={equipment.items} previewUserId={access.previewing ? access.effectiveUserId : undefined} /> : null}
    </main>
  );
}
