import { createDistributor, saveDistributorBrands } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function DistributorsPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: distributors }, { data: profiles }, { data: brands }, { data: distributorBrands }] = await Promise.all([
    admin.from('distributors').select('id,name').order('name'),
    admin.from('profiles').select('id,distributor_id,role'),
    admin
      .from('brands')
      .select('id,name,rentman_name,portal_enabled,is_brand,rentman_active')
      .eq('is_brand', true)
      .eq('rentman_active', true)
      .order('name'),
    admin.from('distributor_brands').select('distributor_id,brand_id'),
  ]);

  const brandsByDistributor = new Map<number, Set<number>>();
  const distributorByBrand = new Map<number, number>();
  for (const row of distributorBrands ?? []) {
    const distributorId = Number(row.distributor_id);
    const brandId = Number(row.brand_id);
    if (!brandsByDistributor.has(distributorId)) brandsByDistributor.set(distributorId, new Set());
    brandsByDistributor.get(distributorId)?.add(brandId);
    distributorByBrand.set(brandId, distributorId);
  }

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Distributeurs</h1>
          <p>Koppel hier eerst de juiste merken aan een distributeur. Daarna bepaal je bij Gebruikers welke van die merken een individuele brandmanager mag zien.</p>
        </div>
      </section>

      <section className="grid grid2">
        <div className="card">
          <h2>Nieuwe distributeur</h2>
          <form action={createDistributor}>
            <div className="field">
              <label htmlFor="name">Naam</label>
              <input className="input" id="name" name="name" placeholder="Bijv. Pernod Ricard" required />
            </div>
            <button className="button orange" type="submit">Toevoegen</button>
          </form>
        </div>
        <div className="card">
          <h2>Hoe de rechten werken</h2>
          <p className="muted">Een merk kan maar aan één distributeur gekoppeld zijn. Zodra een merk is toegewezen, verdwijnt het automatisch uit de keuzelijst van alle andere distributeurs. Binnen die distributeur bepaal je daarna per gebruiker welke merken die persoon mag zien.</p>
        </div>
      </section>

      <div className="stack" style={{ marginTop: 18 }}>
        {(distributors ?? []).map((distributor) => {
          const userCount = (profiles ?? []).filter((profile) => profile.role !== 'admin' && profile.distributor_id === distributor.id).length;
          const distributorId = Number(distributor.id);
          const assigned = brandsByDistributor.get(distributorId) ?? new Set<number>();
          const availableBrands = (brands ?? []).filter((brand) => {
            const ownerDistributorId = distributorByBrand.get(Number(brand.id));
            return ownerDistributorId == null || ownerDistributorId === distributorId;
          });

          return (
            <section className="card distributorBrandCard" key={distributor.id}>
              <div className="userAccessHeader">
                <div>
                  <h2 style={{ marginBottom: 4 }}>{distributor.name}</h2>
                  <span className="muted">{userCount} gebruiker{userCount === 1 ? '' : 's'} · {assigned.size} merk{assigned.size === 1 ? '' : 'en'} gekoppeld</span>
                </div>
              </div>

              <details className="brandAccessDetails" open={assigned.size === 0}>
                <summary>Merken van {distributor.name}</summary>
                <form action={saveDistributorBrands}>
                  <input type="hidden" name="distributor_id" value={distributor.id} />
                  <div className="brandAccessGrid">
                    {availableBrands.map((brand) => (
                      <label className="brandAccessOption" key={brand.id}>
                        <input
                          type="checkbox"
                          name="brand_ids"
                          value={brand.id}
                          defaultChecked={assigned.has(Number(brand.id))}
                        />
                        <span>
                          <strong>{brand.rentman_name ?? brand.name}</strong>
                          <small>{brand.portal_enabled ? 'Actief in portaal' : 'Niet actief in portaal'}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {availableBrands.length === 0 ? (
                    <p className="muted" style={{ marginTop: 12 }}>Alle actieve merken zijn al aan andere distributeurs gekoppeld.</p>
                  ) : null}
                  <div style={{ marginTop: 16 }}>
                    <button className="button orange" type="submit">Merken opslaan</button>
                  </div>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}
