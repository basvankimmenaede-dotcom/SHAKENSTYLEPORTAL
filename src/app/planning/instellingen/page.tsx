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
    <main className="container settingsPage">
      <section className="usersAdminHeader">
        <div>
          <span className="usersAdminEyebrow">Beheer</span>
          <h1>Instellingen</h1>
          <p>Alle vaste planning-, checklist- en weergave-instellingen op één plek.</p>
        </div>
        <Link className="button secondary" href="/planning">← Terug naar planning</Link>
      </section>

      <section className="settingsWorkspace">
        <aside className="settingsLocalNav">
          <div className="settingsLocalNavTitle">Instellingen</div>
          <a className="active" href="#algemeen">Algemeen</a>
          <a href="#terugkerende-taken">Terugkerende taken</a>
          <Link href="/planning/templates">Checklist-templates <span>→</span></Link>
          <Link href="/planning/afsluitlijst/beheer">Afsluitlijst-template <span>→</span></Link>
          <Link href="/planning/tv">TV-weergave <span>→</span></Link>
        </aside>

        <div className="settingsMain">
          <section className="settingsPanel" id="algemeen">
            <header className="settingsPanelHeader">
              <div>
                <span>Algemeen</span>
                <h2>Planning</h2>
                <p>Instellingen die invloed hebben op het dagelijkse planningsoverzicht.</p>
              </div>
            </header>
            <form action={updateFuelCardDistanceSetting} className="settingsFormRow">
              <div>
                <strong>Brandstofpas</strong>
                <span>Markeer personeel wanneer de retourafstand boven deze grens komt.</span>
              </div>
              <div className="planningSettingInline">
                <input className="input" type="number" min="1" name="fuel_card_distance_km" defaultValue={fuelCardDistanceKm} required />
                <span>km retour</span>
              </div>
              <button className="button orange" type="submit">Opslaan</button>
            </form>
          </section>

          <section className="settingsPanel" id="terugkerende-taken">
            <header className="settingsPanelHeader">
              <div>
                <span>Automatisering</span>
                <h2>Terugkerende taken</h2>
                <p>Vaste werkzaamheden die automatisch in de dagelijkse To Do terugkomen.</p>
              </div>
            </header>
            <div className="settingsRecurringList">
              <div className="settingsRecurringRow">
                <div className="settingsRecurringIcon">✓</div>
                <div><strong>Afsluitlijst afronden</strong><span>Ma–vr · Beide · gekoppeld aan Afsluitlijst</span></div>
                <span className="badge green">Actief</span>
              </div>
              <div className="settingsRecurringRow">
                <div className="settingsRecurringIcon">€</div>
                <div><strong>Facturatie</strong><span>Elke woensdag · Kantoor · gekoppeld aan Facturatie</span></div>
                <span className="badge green">Actief</span>
              </div>
            </div>
          </section>

          <section className="settingsPanel">
            <header className="settingsPanelHeader">
              <div>
                <span>Checklists</span>
                <h2>Beheer</h2>
                <p>De verschillende lijsten staan hier samen en openen in hun eigen beheerweergave.</p>
              </div>
            </header>
            <div className="settingsLinkGrid">
              <Link href="/planning/templates">
                <strong>Projectchecklists</strong>
                <span>Templates, taaktype en deadlines beheren.</span>
                <em>Open beheer →</em>
              </Link>
              <Link href="/planning/afsluitlijst/beheer">
                <strong>Afsluitlijst</strong>
                <span>Koppen, dagelijkse en periodieke taken beheren.</span>
                <em>Open beheer →</em>
              </Link>
              <Link href="/planning/tv">
                <strong>TV-weergave</strong>
                <span>Open de schermweergave van de planning.</span>
                <em>Open weergave →</em>
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
