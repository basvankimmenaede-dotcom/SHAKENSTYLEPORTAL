import {requireAdmin} from '@/lib/auth';
import SettingsWorkspace from '@/components/SettingsWorkspace';
import RecurringTasksSettings from '@/components/RecurringTasksSettings';

type Task={title?:string;active?:boolean;task_area?:'office'|'warehouse'|'both';weekday?:number};
type Tasks={closing?:Task;billing?:Task};

export default async function RecurringTasksPage(){
  const {supabase}=await requireAdmin();
  const {data}=await supabase.from('planning_settings').select('recurring_tasks').eq('id',1).maybeSingle();
  const recurring=(data?.recurring_tasks??{}) as Tasks;
  return <SettingsWorkspace active="recurring" title="Terugkerende taken" description="Beheer de vaste taken en hun planning.">
    <section className="settingsPanel">
      <header className="settingsPanelHeader"><div><span>Automatisering</span><h2>Terugkerende taken</h2><p>Pas vaste taken aan zonder losse taken handmatig te corrigeren.</p></div></header>
      <RecurringTasksSettings
        closing={recurring.closing??{title:'Afsluitlijst afronden',active:true,task_area:'both'}}
        billing={recurring.billing??{title:'Facturatie',active:true,task_area:'office',weekday:3}}/>
    </section>
  </SettingsWorkspace>;
}
