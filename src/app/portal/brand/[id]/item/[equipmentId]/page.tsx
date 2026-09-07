import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getEquipmentFiles, getLastEquipmentUsageDate, getVisibleEquipmentItemForFolder } from '@/lib/rentman';

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
    .select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active')
    .eq('id', brandId)
    .eq('portal_enabled', true)
    .eq('is_brand', true)
    .eq('rentman_active', true);

  if (profile.role !== 'admin' && !profile.distributor_id) notFound();

  const { data: brand } = profile.role === 'admin'
    ? await baseBrandQuery.single()
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

  const [item, lastUsage, files] = await Promise.all([
    getVisibleEquipmentItemForFolder(brand.rentman_folder_id, rentmanEquipmentId),
    getLastEquipmentUsageDate(rentmanEquipmentId).catch(() => null),
    getEquipmentFiles(rentmanEquipmentId).catch(() => []),
  ]);

  if (!item) notFound();

  const length = formatDimension(item.length);
  const width = formatDimension(item.width);
  const height = formatDimension(item.height);
  const hasDimensions = Boolean(length || width || height);
  const attachmentFiles = files.filter((file) => file.href !== item.image);

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
          <p className="detailIntro">Details en beschikbaarheid van dit item.</p>

          <div className="detailStatGrid">
            <div className="detailStat">
              <span className="detailLabel">Bij SHAKENSTYLE opgeslagen</span>
              <strong>{item.current_quantity ?? '-'}</strong>
            </div>
            <div className="detailStat">
              <span className="detailLabel">Laatst gebruikt</span>
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
              <p className="muted">Afmetingen zijn nog niet beschikbaar.</p>
            )}
          </section>

          {item.external_remark ? (
            <section className="detailSection">
              <h2>Omschrijving</h2>
              <p>{item.external_remark}</p>
            </section>
          ) : null}

          {attachmentFiles.length > 0 ? (
            <section className="detailSection">
              <h2>Documenten & afbeeldingen</h2>
              <div className="attachmentGrid">
                {attachmentFiles.map((file) => {
                  const href = file.href as string;
                  const isImage = Boolean(file.image) || file.type?.startsWith('image/');
                  const extension = (file.extension ?? file.type?.split('/').pop() ?? 'bestand').toUpperCase();

                  return (
                    <a
                      key={file.id}
                      className={isImage ? 'attachmentCard attachmentImageCard' : 'attachmentCard'}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {isImage ? (
                        <div className="attachmentThumb">
                          <img src={href} alt={file.name} />
                        </div>
                      ) : (
                        <div className="attachmentFileIcon" aria-hidden="true">{extension}</div>
                      )}
                      <div className="attachmentMeta">
                        <strong>{file.name}</strong>
                        <span>{isImage ? 'Afbeelding' : extension} · Open bestand ↗</span>
                        {file.description ? <small>{file.description}</small> : null}
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
