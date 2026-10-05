import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { updateFuelCardDistanceSetting } from '../actions';
import SettingsNav from '@/components/SettingsNav';
import RecurringTasksSettings from '@/components/RecurringTasksSettings';

type RecurringTaskSetting = {
  title?: string;
  active?: boolean;
  task_area?: 'office' | 'warehouse' | 'both';
  weekday?: number;
};

type RecurringTaskSettings = {
  closing?: RecurringTaskSetting;
  billing?: RecurringTaskSetting;
};

export default async function PlanningSettingsPage(){
  const {supabase}=await requireAdmin();
  const {data:settings}=await supabase.from('planning_settings').select('fuel_card_distance_km,recurring_tasks').eq('id',1).maybeSingle();
  const fuelCardDistanceKm=Number(settings?.fuel_card_distance_km??150); const recurring=(settings?.recurring_tasks??{}) as RecurringTaskSettings;
  return <main className="container settingsPage">
    <section className="usersAdminHeader"><div><span className="usersAdminEyebrow">Beheer</span><h1>Instellingen</h1><p>Beheer vaste processen, checklists en weergave-instellingen vanuit één omgeving.</p></div><Link className="button secondary" href="/planning">Terug naar planning</Link></section>
    <section className="settingsWorkspace"><SettingsNav active="general"/><div className="settingsEditorPane settingsMain">
      <section className="settingsPanel"><header className="settingsPanelHeader"><div><span>Algemeen</span><h2>Planning</h2><p>Algemene instellingen die invloed hebben op de dagelijkse planning.</p></div></header>
        <form action={updateFuelCardDistanceSetting} className="settingsFormRow"><div><strong>Brandstofpas</strong><span>Toon de pasmarkering wanneer magazijn → project → magazijn boven deze afstand komt.</span></div><div className="planningSettingInline"><input className="input" type="number" min="1" name="fuel_card_distance_km" defaultValue={fuelCardDistanceKm} required/><span>km retour</span></div><button className="button orange" type="submit">Opslaan</button></form>
      </section>
      <section className="settingsPanel" id="terugkerende-taken"><header className="settingsPanelHeader"><div><span>Automatisering</span><h2>Terugkerende taken</h2><p>Pas vaste taken aan zonder de dagelijkse planning handmatig te corrigeren.</p></div></header>
        <RecurringTasksSettings closing={recurring.closing??{title:'Afsluitlijst afronden',active:true,task_area:'both'}} billing={recurring.billing??{title:'Facturatie',active:true,task_area:'office',weekday:3}}/>
      </section>
      <section className="settingsPanel"><header className="settingsPanelHeader"><div><span>Weergave</span><h2>Schermen</h2><p>Gespecialiseerde weergaven vanuit dezelfde instellingenomgeving.</p></div></header><div className="settingsInlineLinks"><Link href="/planning/tv"><strong>TV-weergave</strong><span>Open de read-only planning voor een extern scherm.</span><b>Openen →</b></Link></div></section>
    </div></section>
  </main>
}
