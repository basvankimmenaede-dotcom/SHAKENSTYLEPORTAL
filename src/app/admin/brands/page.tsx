import SyncRentmanButton from '@/components/SyncRentmanButton';
import { updateBrandSettings } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/auth';

export default async function BrandsPage() {
  const { supabase } = await requireAdmin();
  const { data: brands } = await supabase
    .from('brands')
    .select('id,name,rentman_name,rentman_folder_id,rentman_path,portal_enabled,is_brand,rentman_active,last_synced_at')
    .order('name');

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Merken in beheer</h1>
          <p>De beheeromgeving is de bron. Nieuwe hoofdmappen worden na synchronisatie zichtbaar voor admins, maar nooit automatisch voor klanten.</p>
        </div>
        <SyncRentmanButton />
      </section>

      <div className="notice">Zet <strong>Merk</strong> aan voor echte merkfolders en vervolgens <strong>Actief in portaal</strong> om toewijzing aan klanten mogelijk te maken.</div>

      <div className="tableWrap" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>Map</th><th>Status</th><th>Instellingen</th></tr></thead>
          <tbody>
            {(brands ?? []).map((brand) => (
              <tr key={brand.id}>
                <td>
                  <strong>{brand.rentman_name ?? brand.name}</strong><br />
                  <span className="muted">{brand.rentman_path ?? ''}</span>
                </td>
                
                <td>{brand.rentman_active ? <span className="badge green">In beheer</span> : <span className="badge">Niet meer gevonden</span>}</td>
                <td>
                  <form className="inline" action={updateBrandSettings}>
                    <input type="hidden" name="brand_id" value={brand.id} />
                    <label className="checkRow"><input type="checkbox" name="is_brand" defaultChecked={brand.is_brand} /> Merk</label>
                    <label className="checkRow"><input type="checkbox" name="portal_enabled" defaultChecked={brand.portal_enabled} /> Actief in portaal</label>
                    <button className="button secondary" type="submit">Opslaan</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
