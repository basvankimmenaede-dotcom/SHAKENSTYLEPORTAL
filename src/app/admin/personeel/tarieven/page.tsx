import Link from 'next/link';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export default async function PersonnelTariffsPage(){
 await requireAdmin();
 const admin=createAdminClient();
 const [ratesResult,crewResult]=await Promise.all([
  admin.from('staff_hour_contracts').select('rentman_crew_id,weekly_hours,tracking_start_week,opening_balance_hours,is_active').order('rentman_crew_id'),
  admin.from('crew_portal_members').select('rentman_crew_id,full_name').eq('portal_deleted',false)
 ]);
 const names=new Map((crewResult.data||[]).map(x=>[Number(x.rentman_crew_id),x.full_name]));
 return <main className="container accessAreasPage">
  <section className="usersAdminHeader"><div><span className="usersAdminEyebrow">Personeel / Tarieven</span>
   <h1>Tarieven & contracturen</h1>
   <p>Contracturen staan in het portal. Persoonlijke kostentarieven komen uit Rentman en facturatietarieven uit de bestaande billingmodule.</p></div>
   <Link href="/admin/personeel" className="button secondary">Terug naar personeel</Link>
  </section>
  <section className="accessAreaWarning">Dit overzicht wijzigt geen tarieven in Rentman. Voorkom dubbele tariefinstellingen: gebruik de bestaande bron voor kosten en billing.</section>
  <div className="accessAreaLinks" style={{marginBottom:18}}>
   <Link className="accessAreaLink" href="/planning"><strong>Personeelsuren en weekprognose</strong><span>Open planning</span></Link>
   <Link className="accessAreaLink" href="/planning/billing"><strong>Facturatietarieven</strong><span>Open facturatie</span></Link>
  </div>
  <section className="card crewAccessCard">
   <div className="crewAccessHeader"><div><h2>Contracturen</h2><p>Huidige contractinstellingen in het portaal, gekoppeld aan Rentman-medewerker-ID.</p></div></div>
   {ratesResult.error?<div className="error">Contracturen konden niet worden geladen.</div>:!ratesResult.data?.length?<div className="notice">Er zijn nog geen contracturen geregistreerd.</div>:
   <div className="crewAccessTableWrap"><table className="crewAccessTable"><thead>
    <tr><th>Medewerker</th><th>Uren per week</th><th>Begin saldo (uren)</th><th>Vanaf week</th><th>Status</th></tr>
   </thead><tbody>{ratesResult.data.map(r=><tr key={r.rentman_crew_id}>
    <td><strong>{names.get(Number(r.rentman_crew_id))||'Rentman #'+r.rentman_crew_id}</strong></td>
    <td>{Number(r.weekly_hours||0).toLocaleString('nl-NL')}</td>
    <td>{Number(r.opening_balance_hours||0).toLocaleString('nl-NL')}</td>
    <td>{r.tracking_start_week||'—'}</td>
    <td>{r.is_active?'Actief':'Inactief'}</td>
   </tr>)}</tbody></table></div>}
  </section>
 </main>;
}
