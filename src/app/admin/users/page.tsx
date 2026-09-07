import { assignUserProfile, inviteCustomer } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function UsersPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: userList }, { data: profiles }, { data: distributors }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from('profiles').select('id,full_name,role,distributor_id'),
    admin.from('distributors').select('id,name').order('name'),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Gebruikers</h1>
          <p>Nodig klantgebruikers uit en koppel ze aan de juiste distributeur. Nieuwe accounts blijven standaard customer.</p>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <h2>Klant uitnodigen</h2>
        <form action={inviteCustomer} className="grid grid2">
          <div className="field">
            <label htmlFor="email">E-mailadres</label>
            <input id="email" name="email" className="input" type="email" required placeholder="naam@klant.nl" />
          </div>
          <div className="field">
            <label htmlFor="distributor_id">Distributeur</label>
            <select id="distributor_id" name="distributor_id" className="select" required defaultValue="">
              <option value="" disabled>Kies distributeur</option>
              {(distributors ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><button className="button orange" type="submit">Uitnodiging sturen</button></div>
        </form>
      </section>

      <div className="tableWrap">
        <table>
          <thead><tr><th>Gebruiker</th><th>Rol</th><th>Distributeur</th><th>Wijzigen</th></tr></thead>
          <tbody>
            {(userList?.users ?? []).map((user) => {
              const profile = profileById.get(user.id);
              return (
                <tr key={user.id}>
                  <td><strong>{user.email ?? profile?.full_name ?? user.id}</strong></td>
                  <td>{profile?.role ?? 'customer'}</td>
                  <td>{(distributors ?? []).find((d) => d.id === profile?.distributor_id)?.name ?? '-'}</td>
                  <td>
                    <form action={assignUserProfile} className="inline">
                      <input type="hidden" name="user_id" value={user.id} />
                      <select name="role" className="select" defaultValue={profile?.role ?? 'customer'} style={{ width: 130 }}>
                        <option value="customer">Customer</option>
                        <option value="admin">Admin</option>
                      </select>
                      <select name="distributor_id" className="select" defaultValue={profile?.distributor_id ?? ''} style={{ width: 190 }}>
                        <option value="">Geen distributeur</option>
                        {(distributors ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button className="button secondary" type="submit">Opslaan</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
