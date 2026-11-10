import {requireAdmin} from '@/lib/auth';
import {updateFuelCardDistanceSetting} from '../actions';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import LegacySettingsRedirect from '@/components/LegacySettingsRedirect';

export default async function PlanningSettingsPage(){
  const {supabase}=await requireAdmin();
  const {data:settings}=await supabase.from('planning_settings')
    .select('fuel_card_distance_km').eq('id',1).maybeSingle();
  const distance=Number(settings?.fuel_card_distance_km??150);
  return <SettingsWorkspace active="general" title="Portaalinstellingen" description="Centraal overzicht van alle instellingen voor accounts, mail, facturen, planning en koppelingen.">
    <LegacySettingsRedirect/>
    <section className="settingsPanel accessSettingsPanel">
     <header className="settingsPanelHeader"><div><span>Centraal beheer</span><h2>Portaalinstellingen</h2><p>Alle instellingen in één navigatie. De bestaande configuratie blijft behouden.</p></div></header>
     <div className="accessSettingsGrid">
      <a href="/planning/instellingen/login-beveiliging" className="accessSettingsTile"><strong>Login & beveiliging</strong><span>Toegang, rollen, activatie, resets en crewlogin.</span><small>Openen →</small></a>
      <a href="/planning/instellingen/facturen" className="accessSettingsTile"><strong>E-mail & mailboxen</strong><span>Factuurontvangst, IMAP en synchronisatie.</span><small>Openen →</small></a>
      <a href="/planning/instellingen/factuurverwerking" className="accessSettingsTile"><strong>Factuurworkflow</strong><span>Google AI, twee goedkeurders en boekhoudadres.</span><small>Openen →</small></a>
      <a href="/planning/instellingen/integraties" className="accessSettingsTile"><strong>Integraties</strong><span>Rentman, Supabase Auth, SMTP en AI-koppelingen.</span><small>Openen →</small></a>
      <a href="/planning/instellingen/notificaties" className="accessSettingsTile"><strong>Notificaties</strong><span>Uitgaande berichtstromen en hun instellingen.</span><small>Openen →</small></a>
     </div>
    </section>
    <section className="settingsPanel">
      <header className="settingsPanelHeader">
        <div><span>Algemeen</span><h2>Planning</h2><p>Instellingen die invloed hebben op de dagelijkse planning.</p></div>
      </header>
      <form action={updateFuelCardDistanceSetting} className="settingsFormRow">
        <div><strong>Brandstofpas</strong><span>Markeer magazijn → project → magazijn wanneer de retourafstand boven deze waarde komt.</span></div>
        <div className="planningSettingInline"><input className="input" type="number" min="1" name="fuel_card_distance_km" defaultValue={distance} required/><span>km retour</span></div>
        <button className="button orange" type="submit">Opslaan</button>
      </form>
    </section>
  </SettingsWorkspace>;
}
