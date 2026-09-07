import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getRootEquipmentFolderMap, getVisibleEquipmentForFolder } from '@/lib/rentman';
import EquipmentSearch from '@/components/EquipmentSearch';

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brandId = Number(id);
  if (!Number.isFinite(brandId)) notFound();

  const { supabase, profile } = await requireUser();

  const baseQuery = supabase
    .from('brands')
    .select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active')
    .eq('id', brandId)
    .eq('portal_enabled', true)
    .eq('is_brand', true)
    .eq('rentman_active', true);

  if (profile.role !== 'admin' && !profile.distributor_id) notFound();

  const { data: brand } = profile.role === 'admin'
    ? await baseQuery.single()
    : await supabase
        .from('brands')
        .select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active,distributor_brands!inner(distributor_id)')
        .eq('id', brandId)
        .eq('portal_enabled', true)
        .eq('is_brand', true)
        .eq('rentman_active', true)
        .eq('distributor_brands.distributor_id', profile.distributor_id as number)
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
      <section className="hero">
        <div>
          <Link className="eyebrowLink" href="/portal">← Terug</Link>
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

      {equipment.items.length > 0 ? <EquipmentSearch brandId={brand.id} items={equipment.items} /> : null}
    </main>
  );
}
