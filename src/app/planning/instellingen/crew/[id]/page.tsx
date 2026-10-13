import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import CrewDashboard from '@/app/crew/ui/CrewDashboard';
import {synchronizeCrewAssignments} from '@/lib/crew/synchronize-assignments';

export const dynamic='force-dynamic';

export default async function CrewAdminPreview({params}:{params:Promise<{id:string}>}){
 await requireAdmin();
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
 const admin=createAdminClient();
 const {data:member,error}=await admin.from('crew_portal_members').select('id,full_name').eq('id',id).maybeSingle();
 if(error||!member)notFound();
 const syncResponse=await synchronizeCrewAssignments();
 const from=new Date(Date.now()-7*86400000).toISOString();
 const to=new Date(Date.now()+120*86400000).toISOString();
 const {data:assignments,error:assignmentsError}=await admin.from('crew_portal_assignments')
 .select('id,project_name,project_location,starts_at,ends_at,crew_shift_reports(id,status,submitted_at,work_started_at,work_ended_at,break_minutes,travel_minutes,expenses_amount,expenses_description,breakage_over_ten,missing_materials,missing_materials_description,notes)')
 .eq('crew_member_id',id).gte('starts_at',from).lte('starts_at',to).order('starts_at');
 return <div><div style={{padding:'12px 20px',background:'#f3f3f3'}}><Link href="/planning/instellingen/crew">← Terug naar Crew beheer</Link></div>
 {!syncResponse.ok&&<p role="alert">Rentman synchronisatie mislukt; diensten kunnen ontbreken.</p>}
 {assignmentsError?<p style={{padding:24}}>Diensten konden niet worden geladen.</p>:<CrewDashboard memberName={member.full_name} assignments={assignments||[]} adminPreview/>}</div>;
}
