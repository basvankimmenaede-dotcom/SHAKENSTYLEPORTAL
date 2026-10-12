import { createClient } from '@/lib/supabase/server';
import CrewLogin from './ui/CrewLogin';
import CrewDashboard from './ui/CrewDashboard';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
 const supabase = await createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user?.email) return <CrewLogin />;
 const { data: member } = await supabase.from('crew_portal_members').select('id,full_name,email').or(`email.eq.${user.email},login_email_override.eq.${user.email}`).eq('active', true).maybeSingle();
 if (!member) return <CrewLogin signedInButNotLinked />;
 const from = new Date(Date.now()-7*86400000).toISOString();
 const to = new Date(Date.now()+7*86400000).toISOString();
 const { data: assignments } = await supabase.from('crew_portal_assignments')
 .select('id,project_name,project_location,starts_at,ends_at,crew_shift_reports(id,status)')
 .eq('crew_member_id', member.id).gte('starts_at',from).lte('starts_at',to).order('starts_at');
 return <CrewDashboard memberName={member.full_name} assignments={assignments || []} />;
}
