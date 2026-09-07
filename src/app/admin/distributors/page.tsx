import { createDistributor } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';

export default async function DistributorsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: distributors }, { data: profiles }] = await Promise.all([
    supabase.from('distributors').select('id,name').order('name'),
    supabase.from('profiles').select('id,distributor_id,role'),
  ]);

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Distributeurs</h1>
          <p>Distributeurs zijn alleen de organisatie waartoe een gebruiker behoort. Merkrechten stel je voortaan per gebruiker in.</p>
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
          <h2>Toegang</h2>
          <p className="muted">Ga naar <strong>Gebruikers</strong> om per brandmanager of contactpersoon exact de juiste merken aan te vinken.</p>
        </div>
      </section>

      <div className="tableWrap" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>Distributeur</th><th>Gebruikers</th></tr></thead>
          <tbody>
            {(distributors ?? []).map((distributor) => {
              const userCount = (profiles ?? []).filter((profile) => profile.role !== 'admin' && profile.distributor_id === distributor.id).length;
              return (
                <tr key={distributor.id}>
                  <td><strong>{distributor.name}</strong></td>
                  <td>{userCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
