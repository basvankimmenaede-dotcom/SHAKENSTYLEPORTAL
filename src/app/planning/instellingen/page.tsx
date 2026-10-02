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

      <div className="settingsSectionLabel">Planning beheren</div>
      <section className="settingsHubGrid">
        <a className="settingsHubCard" href="#terugkerende-taken">
          <span className="settingsHubIcon">↻</span>
          <strong>Terugkerende taken</strong>
          <span>Beheer vaste werkzaamheden zoals Afsluitlijst en Facturatie vanuit één plek.</span>
        </a>
        <Link className="settingsHubCard" href="/planning/templates">
          <span className="settingsHubIcon">✓</span>
          <strong>Checklist-templates</strong>
          <span>Beheer de templates die automatisch aan Rentman-projecten worden gekoppeld.</span>
        </Link>
        <Link className="settingsHubCard" href="/planning/afsluitlijst/beheer">
          <span className="settingsHubIcon">☑</span>
          <strong>Afsluitlijst-template</strong>
          <span>Bepaal welke onderdelen dagelijks door kantoor en magazijn worden afgerond.</span>
        </Link>
        <Link className="settingsHubCard" href="/planning/tv">
          <span className="settingsHubIcon">▣</span>
          <strong>TV-weergave</strong>
          <span>Open de planningweergave voor het scherm op kantoor of in het magazijn.</span>
        </Link>
      </section>

      <section className="usersDetail" id="terugkerende-taken">
        <header className="usersDetailHeader">
          <div className="usersDetailIdentity">
            <span className="usersAvatar large">↻</span>
            <div>
              <div className="usersDetailTitle"><h2>Terugkerende taken</h2></div>
              <p>Vaste werkzaamheden die automatisch terugkomen in de planning.</p>
            </div>
          </div>
        </header>
        <div className="usersDetailPanel">
          <div className="closingTaskListV2">
            <div className="closingTaskCard">
              <div><strong>Afsluitlijst afronden</strong><span>Ma–vr · Beide · gekoppeld aan Afsluitlijst</span></div>
              <span className="badge green">Actief</span>
            </div>
            <div className="closingTaskCard">
              <div><strong>Facturatie</strong><span>Elke woensdag · Kantoor · gekoppeld aan Facturatie</span></div>
              <span className="badge green">Actief</span>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14 }}>Uitgebreid beheer van frequentie en nieuwe terugkerende taken volgt vanuit deze centrale plek.</p>
        </div>
      </section>

      <div className="settingsSectionLabel">Algemeen</div>
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
