import {requireAdmin} from '@/lib/auth';
import {updateFuelCardDistanceSetting} from '../actions';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import LegacySettingsRedirect from '@/components/LegacySettingsRedirect';

export default async function PlanningSettingsPage(){
  const {supabase}=await requireAdmin();
  const {data:settings}=await supabase.from('planning_settings')
    .select('fuel_card_distance_km').eq('id',1).maybeSingle();
  const distance=Number(settings?.fuel_card_distance_km??150);
  return <SettingsWorkspace active="general" title="Algemene instellingen" description="Beheer de algemene instellingen van de planning. Andere onderdelen vind je in het menu links.">
    <LegacySettingsRedirect/>
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
