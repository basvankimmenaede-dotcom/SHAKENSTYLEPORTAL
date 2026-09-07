import Link from 'next/link';
import { assignUserProfile, inviteCustomer, saveUserBrandAccess } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function UsersPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: userList }, { data: profiles }, { data: distributors }, { data: brands }, { data: accessRows }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from('profiles').select('id,full_name,role,distributor_id'),
    admin.from('distributors').select('id,name').order('name'),
    admin
      .from('brands')
      .select('id,name,rentman_name,portal_enabled,is_brand,rentman_active')
      .eq('is_brand', true)
      .eq('rentman_active', true)
      .eq('portal_enabled', true)
      .order('name'),
    admin.from('user_brand_access').select('user_id,brand_id'),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const distributorById = new Map((distributors ?? []).map((d) => [d.id, d.name]));
  const accessByUser = new Map<string, Set<number>>();
  for (const row of accessRows ?? []) {
    if (!accessByUser.has(row.user_id)) accessByUser.set(row.user_id, new Set());
    accessByUser.get(row.user_id)?.add(row.brand_id);
  }

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Gebruikers</h1>
          <p>Koppel gebruikers aan hun organisatie en bepaal per persoon exact welke merken zichtbaar zijn.</p>
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
            <label htmlFor="distributor_id">Organisatie</label>
            <select id="distributor_id" name="distributor_id" className="select" required defaultValue="">
              <option value="" disabled>Kies organisatie</option>
              {(distributors ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><button className="button orange" type="submit">Uitnodiging sturen</button></div>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>Na uitnodigen wijs je hieronder de juiste merken aan. Nieuwe gebruikers krijgen niet automatisch toegang tot alle merken van hun organisatie.</p>
      </section>

      <div className="stack">
        {(userList?.users ?? []).map((user) => {
          const profile = profileById.get(user.id);
          const role = profile?.role ?? 'customer';
          const assigned = accessByUser.get(user.id) ?? new Set<number>();
          const email = user.email ?? profile?.full_name ?? user.id;
          const distributorName = profile?.distributor_id ? distributorById.get(profile.distributor_id) : null;

          return (
            <section className="card userAccessCard" key={user.id}>
              <div className="userAccessHeader">
                <div>
                  <h2 style={{ marginBottom: 4 }}>{email}</h2>
                  <span className="muted">{role === 'admin' ? 'Admin · toegang tot alles' : `${distributorName ?? 'Geen organisatie'} · ${assigned.size} merk${assigned.size === 1 ? '' : 'en'}`}</span>
                </div>
                {role !== 'admin' ? (
                  <Link className="button secondary" href={`/portal?as=${encodeURIComponent(user.id)}`}>Bekijk als gebruiker</Link>
                ) : null}
              </div>

              <form action={assignUserProfile} className="inline userProfileForm">
                <input type="hidden" name="user_id" value={user.id} />
                <select name="role" className="select" defaultValue={role} style={{ width: 140 }}>
                  <option value="customer">Customer</option>
                  <option value="admin">Admin</option>
                </select>
                <select name="distributor_id" className="select" defaultValue={profile?.distributor_id ?? ''} style={{ width: 220 }}>
                  <option value="">Geen organisatie</option>
                  {(distributors ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button className="button secondary" type="submit">Profiel opslaan</button>
              </form>

              {role !== 'admin' ? (
                <details className="brandAccessDetails" open={assigned.size === 0}>
                  <summary>Merken beheren</summary>
                  <form action={saveUserBrandAccess}>
                    <input type="hidden" name="user_id" value={user.id} />
                    <div className="brandAccessGrid">
                      {(brands ?? []).map((brand) => (
                        <label className="brandAccessOption" key={brand.id}>
                          <input type="checkbox" name="brand_ids" value={brand.id} defaultChecked={assigned.has(brand.id)} />
                          <span>
                            <strong>{brand.rentman_name ?? brand.name}</strong>
                            <small>{brand.portal_enabled ? 'Actief in portaal' : 'Niet actief'}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <button className="button orange" type="submit">Merktoegang opslaan</button>
                    </div>
                  </form>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
