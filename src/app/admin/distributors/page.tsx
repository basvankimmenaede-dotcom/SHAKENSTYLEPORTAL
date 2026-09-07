import { createDistributor, setDistributorBrand } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';

export default async function DistributorsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: distributors }, { data: brands }, { data: assignments }] = await Promise.all([
    supabase.from('distributors').select('id,name').order('name'),
    supabase.from('brands').select('id,name,rentman_folder_id,portal_enabled,is_brand,rentman_active').eq('is_brand', true).eq('rentman_active', true).order('name'),
    supabase.from('distributor_brands').select('distributor_id,brand_id'),
  ]);

  const assigned = new Set((assignments ?? []).map((row) => `${row.distributor_id}:${row.brand_id}`));

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Distributeurs</h1>
          <p>Maak een distributeur aan en bepaal vervolgens zelf welke actieve merken deze klant mag zien.</p>
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
          <h2>Werking</h2>
          <p className="muted">Alleen merken die onder Merken & Rentman op actief staan, kunnen effectief in het klantportaal verschijnen. Een koppeling hier alleen is dus niet genoeg.</p>
        </div>
      </section>

      <div className="stack" style={{ marginTop: 18 }}>
        {(distributors ?? []).map((distributor) => (
          <section className="card" key={distributor.id}>
            <div className="split">
              <div>
                <h2 style={{ marginBottom: 4 }}>{distributor.name}</h2>
                <span className="muted">Merken toewijzen</span>
              </div>
            </div>
            <div className="tableWrap" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Merk</th><th>Rentman ID</th><th>Portaal actief</th><th>Toegang</th></tr></thead>
                <tbody>
                  {(brands ?? []).map((brand) => {
                    const checked = assigned.has(`${distributor.id}:${brand.id}`);
                    return (
                      <tr key={brand.id}>
                        <td><strong>{brand.name}</strong></td>
                        <td>{brand.rentman_folder_id ?? '-'}</td>
                        <td>{brand.portal_enabled ? <span className="badge green">Actief</span> : <span className="badge">Uit</span>}</td>
                        <td>
                          <form action={setDistributorBrand}>
                            <input type="hidden" name="distributor_id" value={distributor.id} />
                            <input type="hidden" name="brand_id" value={brand.id} />
                            <div className="inline">
                              <label className="checkRow">
                                <input type="checkbox" name="enabled" defaultChecked={checked} />
                                <span>{checked ? 'Toegewezen' : 'Niet toegewezen'}</span>
                              </label>
                              <button className="button secondary" type="submit">Opslaan</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
