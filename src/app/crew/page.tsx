import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { synchronizeCrewAssignments } from '@/lib/crew/synchronize-assignments';
import CrewLogin from './ui/CrewLogin';
import CrewDashboard from './ui/CrewDashboard';

export const dynamic = 'force-dynamic';

export default async function CrewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return <CrewLogin />;

  const { data: member } = await supabase
    .from('crew_portal_members')
    .select('id,full_name,email,login_email_override,rentman_crew_id,portal_enabled')
    .eq('portal_enabled', true).maybeSingle();
  const linkedEmail = (member?.login_email_override || member?.email || '').trim().toLowerCase();
  // Crew portal access depends on an enabled SHAKENSTYLE profile and matching login email, not Rentman's status or crew ID.
  if (!member || linkedEmail !== user.email.trim().toLowerCase()) {
    return <CrewLogin signedInButNotLinked />;
  }

  after(async () => {
    try { await synchronizeCrewAssignments(); }
    catch (error) { console.error('Crew assignment sync failed', error); }
  });
  const from = new Date(Date.now() - 120 * 86400000).toISOString();
  const to = new Date(Date.now() + 120 * 86400000).toISOString();
  const [shiftsResult, reportsResult, invoicesResult] = await Promise.all([
    supabase.from('crew_portal_assignments')
      .select('id,rentman_project_id,project_name,project_location,starts_at,ends_at')
      .eq('crew_member_id', member.id).gte('starts_at', from).lte('starts_at', to).order('starts_at'),
    supabase.from('crew_shift_reports')
      .select('id,assignment_id,status,submitted_at,work_started_at,work_ended_at,break_minutes,travel_minutes,expenses_amount,expenses_description,breakage_over_ten,missing_materials,missing_materials_description,notes')
      .eq('crew_member_id', member.id),
    supabase.from('crew_invoices')
      .select('id,invoice_number,invoice_date,total_amount,status,correction_reason,correction_notified_at,forwarded_at,created_at')
      .eq('crew_member_id', member.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (shiftsResult.error) console.error('Crew assignments unavailable', shiftsResult.error.message);
  if (reportsResult.error) console.error('Crew reports unavailable', reportsResult.error.message);
  if (invoicesResult.error) console.error('Crew invoices unavailable', invoicesResult.error.message);
  const reportsByAssignment = new Map<string, NonNullable<typeof reportsResult.data>>();
  for (const report of reportsResult.data || []) {
    const grouped = reportsByAssignment.get(report.assignment_id) || [];
    grouped.push(report);
    reportsByAssignment.set(report.assignment_id, grouped);
  }
  const assignments = (shiftsResult.data || []).map(a => ({
    ...a, crew_shift_reports: reportsByAssignment.get(a.id) || [],
  }));
  return <CrewDashboard
    memberName={member.full_name}
    assignments={assignments}
    invoices={invoicesResult.data || []}
    reportsLoadError={Boolean(shiftsResult.error || reportsResult.error)}
    invoicesLoadError={Boolean(invoicesResult.error)}
  />;
}
