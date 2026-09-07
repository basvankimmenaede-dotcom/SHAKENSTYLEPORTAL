import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getRootEquipmentFolderMap } from '@/lib/rentman';

export default async function PortalPage() {
  const { supabase, profile } = await requireUser();

  if (!profile.distributor_id && profile.role !== 'admin') {
    return (
      <main className="container">
        <section className="hero">
          <div>
            <h1>Welkom</h1>
            <p>Je account is actief, maar SHAKENSTYLE heeft nog geen distributeur aan je profiel gekoppeld.</p>
          </div>
        </section>
        <div className="notice">Neem contact op met SHAKENSTYLE om je klanttoegang te activeren.</div>
      </main>
    );
  }

  let distributorName = profile.role === 'admin' ? 'Alle merken' : 'Portaal';
  if (profile.role !== 'admin' && profile.distributor_id) {
    const { data: distributor } = await supabase.from('distributors').select('name').eq('id', profile.distributor_id).single();
    if (distributor?.name) distributorName = distributor.name;
  }

  const { data: brands } = profile.role === 'admin'
    ? await supabase
        .from('brands')
        .select('id,name,rentman_folder_id,rentman_path')
        .eq('portal_enabled', true)
        .eq('is_brand', true)
        .eq('rentman_active', true)
        .order('name')
    : await supabase
        .from('brands')
        .select('id,name,rentman_folder_id,rentman_path,distributor_brands!inner(distributor_id)')
        .eq('portal_enabled', true)
        .eq('is_brand', true)
        .eq('rentman_active', true)
        .eq('distributor_brands.distributor_id', profile.distributor_id as number)
        .order('name');


  let liveFolders = new Map<number, { id: number; name: string; parent: string | null; path?: string }>();
  try {
    liveFolders = await getRootEquipmentFolderMap();
  } catch {
    // Supabase blijft de veilige fallback als de beheerverbinding tijdelijk niet beschikbaar is.
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
      <section className="hero">
        <div>
          <h1>{distributorName}</h1>
          <p>Bekijk de opgeslagen materialen die SHAKENSTYLE voor jouw organisatie beheert.</p>
        </div>
      </section>

      {displayBrands.length === 0 ? (
        <div className="notice">Er zijn nog geen merken aan jouw account toegewezen.</div>
      ) : (
        <section className="brandGrid">
          {displayBrands.map((brand) => (
            <Link href={`/portal/brand/${brand.id}`} className="brandCard" key={brand.id}>
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
