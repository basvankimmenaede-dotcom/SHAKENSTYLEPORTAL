import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getLastEquipmentUsageDate, getVisibleEquipmentItemForFolder } from '@/lib/rentman';

function formatDate(value: string | null) {
  if (!value) return 'Nog geen inzet gevonden';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDimension(value?: number) {
  if (!value || value <= 0) return null;
  if (value <= 10) return `${Math.round(value * 100)} cm`;
  return `${value} cm`;
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; equipmentId: string }>;
}) {
  const { id, equipmentId } = await params;
  const brandId = Number(id);
  const rentmanEquipmentId = Number(equipmentId);
  if (!Number.isFinite(brandId) || !Number.isFinite(rentmanEquipmentId)) notFound();

  const { supabase, profile } = await requireUser();

  const baseBrandQuery = supabase
    .from('brands')
    .eq('id', brandId)
    .eq('portal_enabled', true)
    .eq('is_brand', true)
    .eq('rentman_active', true);

  if (profile.role !== 'admin' && !profile.distributor_id) notFound();

  const { data: brand } = profile.role === 'admin'
    ? await baseBrandQuery.select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active').single()
    : await baseBrandQuery
        .select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active,distributor_brands!inner(distributor_id)')
        .eq('distributor_brands.distributor_id', profile.distributor_id as number)
        .single();
  if (!brand?.rentman_folder_id) notFound();

  const [item, lastUsage] = await Promise.all([
    getVisibleEquipmentItemForFolder(brand.rentman_folder_id, rentmanEquipmentId),
    getLastEquipmentUsageDate(rentmanEquipmentId).catch(() => null),
  ]);

  if (!item) notFound();

  const length = formatDimension(item.length);
  const width = formatDimension(item.width);
  const height = formatDimension(item.height);
  const hasDimensions = Boolean(length || width || height);

  return (
    <main className="container itemDetailPage">
      <Link className="eyebrowLink" href={`/portal/brand/${brand.id}`}>← Terug naar {brand.name}</Link>

      <section className="itemDetailGrid">
        <div className="detailImagePanel">
          {item.image ? <img src={item.image} alt={item.name} /> : <div className="noImageLarge">Geen afbeelding beschikbaar</div>}
        </div>

        <div className="detailContent">
          <span className="badge">{item.code || `#${item.id}`}</span>
          <h1>{item.name}</h1>
          <p className="detailIntro">Actuele itemgegevens uit Rentman.</p>

          <div className="detailStatGrid">
            <div className="detailStat">
              <span className="detailLabel">Opgeslagen voorraad</span>
              <strong>{item.current_quantity ?? '-'}</strong>
            </div>
            <div className="detailStat">
              <span className="detailLabel">Laatste inzet</span>
              <strong className="detailTextValue">{formatDate(lastUsage)}</strong>
            </div>
          </div>

          <section className="detailSection">
            <h2>Afmetingen</h2>
            {hasDimensions ? (
              <div className="dimensionGrid">
                <div><span>Lengte</span><strong>{length ?? '-'}</strong></div>
                <div><span>Breedte</span><strong>{width ?? '-'}</strong></div>
                <div><span>Hoogte</span><strong>{height ?? '-'}</strong></div>
              </div>
            ) : (
              <p className="muted">Voor dit item zijn nog geen afmetingen ingevuld in Rentman.</p>
            )}
          </section>

          {item.external_remark ? (
            <section className="detailSection">
              <h2>Omschrijving</h2>
              <p>{item.external_remark}</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
