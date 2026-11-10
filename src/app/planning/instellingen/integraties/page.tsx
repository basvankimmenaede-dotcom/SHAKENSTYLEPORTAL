import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import SettingsWorkspace from '@/components/SettingsWorkspace';
export const dynamic='force-dynamic';
export default async function PortalIntegrationsSettingsPage(){
 await requireAdmin();
 const admin=createAdminClient();
 const [imap,google,brands]=await Promise.all([
  admin.from('invoice_imap_settings').select('host,username,enabled,tested_at,last_sync_at').eq('id',1).maybeSingle(),
  admin.from('invoice_processing_settings').select('google_project_id,google_processor_id,google_service_account_encrypted,google_tested_at').eq('id',1).maybeSingle(),
  admin.from('brands').select('*',{count:'exact',head:true}).eq('rentman_active',true)
 ]);
 const connected=Boolean(imap.data?.tested_at&&imap.data?.username);
 const googleReady=Boolean(google.data?.google_project_id&&google.data?.google_processor_id&&google.data?.google_service_account_encrypted&&google.data?.google_tested_at);
 const smtpReady=Boolean(process.env.CREW_SMTP_HOST&&process.env.CREW_SMTP_USER&&process.env.CREW_SMTP_PASSWORD);
 const cards=[
  {title:'Rentman',status:'Gegevens aanwezig',description:(brands.count??0)+' actieve Rentman-mappen in het portaal. Dit is geen live verbindingstest.',href:'/planning/rentman-wijzigingen',action:'Rentman wijzigingen'},
  {title:'Antagonist IMAP',status:connected?'Verbinding getest':'Niet getest',description:'Mail ophalen voor inkomende facturen'+(imap.data?.enabled?' (automatisch aan).':' (automatisch uit).'),href:'/planning/instellingen/facturen',action:'Mailboxinstellingen'},
  {title:'Google Document AI',status:googleReady?'Verbinding getest':'Niet ingesteld / getest',description:'Invoice Parser, project-ID, serviceaccount en AI-factuurherkenning.',href:'/planning/instellingen/factuurverwerking',action:'Google AI instellen'},
  {title:'Uitgaande e-mail (SMTP)',status:smtpReady?'Geconfigureerd':'Niet volledig geconfigureerd',description:'Berichten voor rapporten, correcties en boekhouddoorsturing. Verzending is hier niet live getest.',href:'/planning/instellingen/notificaties',action:'Notificaties bekijken'},
  {title:'Supabase Auth',status:'In gebruik',description:'Authenticatie en wachtwoorden voor klant-, kantoor- en crewaccounts.',href:'/planning/instellingen/login-beveiliging',action:'Loginbeheer'}
 ];
 return <SettingsWorkspace active="integrations" title="Integraties" description="Alle koppelingen en hun configuratie op één plek.">
  <section className="settingsPanel accessSettingsPanel">
   <header className="settingsPanelHeader"><div><span>Technische koppelingen</span><h2>Verbindingen</h2><p>Een status &ldquo;geconfigureerd&rdquo; betekent niet dat er al een volledige end-to-end test is geslaagd.</p></div></header>
   <div className="accessIntegrationList">{cards.map(item=><div className="accessIntegrationRow" key={item.title}>
    <div><strong>{item.title}</strong><span>{item.description}</span></div>
    <small>{item.status}</small><Link className="button secondary" href={item.href}>{item.action}</Link>
   </div>)}</div>
  </section>
 </SettingsWorkspace>;
}
