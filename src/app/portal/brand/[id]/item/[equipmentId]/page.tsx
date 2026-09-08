import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getEquipmentFiles, getLastEquipmentUsageDate, getVisibleEquipmentItemForFolder } from '@/lib/rentman';
import { getAccessibleBrandIds, resolvePortalAccessContext, withPreview } from '@/lib/portal-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { saveEquipmentCustomerNote } from '@/app/admin/actions';

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
  searchParams,
}: {
  params: Promise<{ id: string; equipmentId: string }>;
  searchParams?: Promise<{ as?: string }>;
}) {
  const { id, equipmentId } = await params;
  const query = searchParams ? await searchParams : {};
  const brandId = Number(id);
  const rentmanEquipmentId = Number(equipmentId);
  if (!Number.isFinite(brandId) || !Number.isFinite(rentmanEquipmentId)) notFound();

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

  const [item, lastUsage, files, customerNoteResult] = await Promise.all([
    getVisibleEquipmentItemForFolder(brand.rentman_folder_id, rentmanEquipmentId),
    getLastEquipmentUsageDate(rentmanEquipmentId).catch(() => null),
    getEquipmentFiles(rentmanEquipmentId).catch(() => []),
    admin
      .from('equipment_customer_notes')
      .select('note')
      .eq('equipment_id', rentmanEquipmentId)
      .maybeSingle(),
  ]);

  if (!item) notFound();
  const customerNote = customerNoteResult.data?.note?.trim() ?? '';

  const length = formatDimension(item.length);
  const width = formatDimension(item.width);
  const height = formatDimension(item.height);
  const hasDimensions = Boolean(length || width || height);
  const attachmentFiles = files.filter((file) => file.href !== item.image);

  return (
    <main className="container itemDetailPage">
      {access.previewing ? (
        <div className="previewBanner pagePreviewBanner">Gebruikersweergave: {access.previewLabel}</div>
      ) : null}
      <Link className="eyebrowLink" href={withPreview(`/portal/brand/${brand.id}`, access.previewing ? access.effectiveUserId : null)}>← Terug naar {brand.name}</Link>

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

          {customerNote || (profile.role === 'admin' && !access.previewing) ? (
            <section className="detailSection customerNoteSection">
              <h2>Notities klant</h2>
              {profile.role === 'admin' && !access.previewing ? (
                <form action={saveEquipmentCustomerNote} className="customerNoteForm">
                  <input type="hidden" name="brand_id" value={brand.id} />
                  <input type="hidden" name="equipment_id" value={rentmanEquipmentId} />
                  <textarea
                    className="input customerNoteInput"
                    name="customer_note"
                    defaultValue={customerNote}
                    placeholder="Bijv. 1 deksel ontbreekt, kras op linkerzijde, alleen compleet uitgeven..."
                    rows={4}
                  />
                  <div className="customerNoteActions">
                    <span className="muted">Deze notitie is zichtbaar voor klanten met toegang tot dit merk.</span>
                    <button className="button secondary" type="submit">Notitie opslaan</button>
                  </div>
                </form>
              ) : (
                <div className="customerNoteDisplay">{customerNote}</div>
              )}
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
                    <a key={file.id} className={isImage ? 'attachmentCard attachmentImageCard' : 'attachmentCard'} href={href} target="_blank" rel="noreferrer">
                      {isImage ? (
                        <div className="attachmentThumb"><img src={href} alt={file.name} /></div>
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
