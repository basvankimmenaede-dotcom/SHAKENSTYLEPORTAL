import Link from 'next/link';
import { requireUser } from '@/lib/auth';

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

  let query = supabase
    .from('brands')
    .select('id,name,rentman_folder_id,rentman_path,distributor_brands!inner(distributor_id)')
    .eq('portal_enabled', true)
    .eq('is_brand', true)
    .eq('rentman_active', true)
    .order('name');

  if (profile.role !== 'admin') {
    query = query.eq('distributor_brands.distributor_id', profile.distributor_id as number);
  }

  const { data: brands } = await query;

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Mijn merken</h1>
          <p>Bekijk de opgeslagen materialen die SHAKENSTYLE voor jouw organisatie beheert.</p>
        </div>
      </section>

      {(brands ?? []).length === 0 ? (
        <div className="notice">Er zijn nog geen merken aan jouw account toegewezen.</div>
      ) : (
        <section className="brandGrid">
          {(brands ?? []).map((brand) => (
            <Link href={`/portal/brand/${brand.id}`} className="brandCard" key={brand.id}>
              <div>
                <span className="badge green">Rentman #{brand.rentman_folder_id}</span>
                <h2>{brand.name}</h2>
                <p className="muted">{brand.rentman_path ?? 'Opgeslagen materialen'}</p>
              </div>
              <strong>Bekijk voorraad -></strong>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
