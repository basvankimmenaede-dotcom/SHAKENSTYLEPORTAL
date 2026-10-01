import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { updateFuelCardDistanceSetting } from '../actions';

export default async function PlanningSettingsPage() {
  const { supabase } = await requireAdmin();
  const { data: settings } = await supabase
    .from('planning_settings')
    .select('fuel_card_distance_km')
    .eq('id', 1)
    .maybeSingle();

  const fuelCardDistanceKm = Number(settings?.fuel_card_distance_km ?? 150);

  return (
    <main className="container usersAdminPage">
      <section className="usersAdminHeader">
        <div>
          <span className="usersAdminEyebrow">Planning</span>
          <h1>Instellingen</h1>
          <p>Beheer vaste instellingen voor de interne planning.</p>
        </div>
        <Link className="button secondary" href="/planning">← Terug naar planning</Link>
      </section>

      <section className="usersDetail">
        <header className="usersDetailHeader">
          <div className="usersDetailIdentity">
            <span className="usersAvatar large">P</span>
            <div>
              <div className="usersDetailTitle"><h2>Brandstofpas</h2></div>
              <p>Bepaal vanaf welke totale retourafstand een pasmarkering verschijnt bij gepland personeel.</p>
            </div>
          </div>
        </header>

        <div className="usersDetailPanel">
          <form action={updateFuelCardDistanceSetting} className="planningSettingsForm">
            <div className="field">
              <label>Pas nodig vanaf</label>
              <div className="planningSettingInline">
                <input
                  className="input"
                  type="number"
                  min="1"
                  name="fuel_card_distance_km"
                  defaultValue={fuelCardDistanceKm}
                  required
                />
                <span>km retour</span>
              </div>
              <small>De afstand wordt berekend als Rentman-afstand magazijn → projectlocatie × 2.</small>
            </div>
            <div className="usersPanelFooter">
              <button className="button orange" type="submit">Instelling opslaan</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
