import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {getAccountDirectoryCounts} from '@/lib/account-directory';
import SyncRentmanButton from '@/components/SyncRentmanButton';
export default async function AdminDashboard(){
 const {profile}=await requireAdmin();
 const accountStats=await getAccountDirectoryCounts();
 return <main className="container accessAreasPage">
  <section className="usersAdminHeader">
   <div><span className="usersAdminEyebrow">SHAKENSTYLE Portal</span>
    <h1>Dashboard</h1><p>Welkom {profile.full_name||'SHAKENSTYLE'}. Personeel, klanten en interne accounts zijn apart georganiseerd.</p></div>
   <SyncRentmanButton/>
  </section>
  <section className="accessAreaMetrics">
   <div className="accessAreaMetric"><span>Crewprofielen</span><strong>{accountStats.crew}</strong><small>Rentman-gekoppeld</small></div>
   <div className="accessAreaMetric"><span>Klantaccounts</span><strong>{accountStats.customers}</strong><small>Gekoppeld aan organisaties</small></div>
   <div className="accessAreaMetric"><span>Interne accounts</span><strong>{accountStats.internal}</strong><small>Kantoor & magazijn</small></div>
  </section>
  <section className="accessAreasGroups">
   <Link className="accessAreaGroup personnel accessDashboardLink" href="/admin/personeel">
    <div className="accessAreaGroupHead"><div><h2>Personeel</h2><p>Crewprofielen, diensten, uren, tarieven en facturen.</p></div></div>
    <span>Open personeelsbeheer →</span>
   </Link>
   <Link className="accessAreaGroup customer accessDashboardLink" href="/admin/klanten">
    <div className="accessAreaGroupHead"><div><h2>Klanten</h2><p>Klantaccounts, contactpersonen, organisaties en portaaltoegang.</p></div></div>
    <span>Open klantenbeheer →</span>
   </Link>
   <Link className="accessAreaGroup internal accessDashboardLink" href="/admin/intern">
    <div className="accessAreaGroupHead"><div><h2>Intern</h2><p>Kantoor-/magazijnaccounts, rollen, uitnodigingen en beveiliging.</p></div></div>
    <span>Open intern beheer →</span>
   </Link>
  </section>
  <section className="accessSettingsShortcut"><div><h2>Alle accounts & instellingen</h2>
   <p>Start bij het overzicht voor alle accountgroepen en ga naar Portaalinstellingen voor de centrale configuratie.</p></div>
   <Link className="button secondary" href="/admin/accounts">Accounts & toegang</Link>
   <Link className="button orange" href="/planning/instellingen">Portaalinstellingen</Link>
  </section>
 </main>;
}
