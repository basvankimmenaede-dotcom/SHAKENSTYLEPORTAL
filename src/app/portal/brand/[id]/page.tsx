import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getVisibleEquipmentForFolder } from '@/lib/rentman';

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
  let rentmanError = '';
  try {
    equipment = await getVisibleEquipmentForFolder(brand.rentman_folder_id);
  } catch (error) {
    rentmanError = error instanceof Error ? error.message : 'Rentman kon niet worden geladen.';
  }

  return (
    <main className="container">
      <section className="hero">
        <div>
          <Link className="eyebrowLink" href="/portal">← Mijn merken</Link>
          <h1>{brand.name}</h1>
          <p>Bekijk de materialen die SHAKENSTYLE voor dit merk beheert.</p>
        </div>
      </section>

      {rentmanError ? <div className="error">{rentmanError}</div> : null}
      {!equipment.configured ? (
        <div className="notice">De Rentman custom-field key is nog niet geconfigureerd in de website. Tot die tijd worden uit veiligheid geen items getoond.</div>
      ) : null}
      {equipment.configured && equipment.items.length === 0 ? (
        <div className="notice">Voor dit merk zijn nog geen zichtbare items gevonden.</div>
      ) : null}

      <section className="itemGrid">
        {equipment.items.map((item) => (
          <Link className="itemCard" key={item.id} href={`/portal/brand/${brand.id}/item/${item.id}`}>
            <div className="itemImage">
              {item.image ? <img src={item.image} alt={item.name} /> : <span>Geen afbeelding</span>}
            </div>
            <div className="itemBody">
              <span className="badge">{item.code || `#${item.id}`}</span>
              <h3>{item.name}</h3>
              <div className="metric">{item.current_quantity ?? '-'}</div>
              <div className="muted">Opgeslagen voorraad</div>
              <div className="itemMore">Bekijk details →</div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
