import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
export const runtime = 'nodejs';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  const { assignmentId } = await request.json().catch(() => ({}));
  if (typeof assignmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(assignmentId)) return NextResponse.json({ error: 'Ongeldige dienst' }, { status: 400 });
  const { data: member } = await supabase.from('crew_portal_members').select('id,full_name').eq('active', true).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Geen crew-toegang' }, { status: 403 });
  const admin = createAdminClient();
  const { data: assignment } = await admin.from('crew_portal_assignments').select('id,project_name,crew_member_id').eq('id', assignmentId).eq('crew_member_id', member.id).maybeSingle();
  if (!assignment) return NextResponse.json({ error: 'Dienst niet gevonden' }, { status: 404 });
  const { data: report } = await admin.from('crew_shift_reports').select('*').eq('assignment_id', assignmentId).eq('crew_member_id', member.id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Rapport niet gevonden' }, { status: 404 });
  if (report.confirmation_email_sent_at) return NextResponse.json({ sent: true, alreadySent: true });
  const key = process.env.RESEND_API_KEY;
  const from = process.env.CREW_REPORT_EMAIL_FROM;
  if (!key || !from) return NextResponse.json({ error: 'E-mailverzending is nog niet ingesteld' }, { status: 503 });
  const fmt = (value: string) => new Date(value).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' });
  const fields = [
    ['Begin',fmt(report.work_started_at)],['Eind',fmt(report.work_ended_at)],['Pauze',report.break_minutes+' minuten'],['Reistijd',report.travel_minutes+' minuten'],
    ['Onkosten','€ '+Number(report.expenses_amount || 0).toFixed(2)],['Toelichting onkosten',report.expenses_description || '—'],
    ['Meer dan 10 glazen gebroken',report.breakage_over_ten?'Ja':'Nee'],['Ontbrekend materiaal',report.missing_materials?'Ja':'Nee'],
    ['Omschrijving ontbrekend materiaal',report.missing_materials_description || '—'],['Opmerkingen',report.notes || '—']
  ];
  const html = '<h2>Bevestiging shiftrapport</h2><p>Je rapport voor <strong>'+escapeHtml(assignment.project_name)+'</strong> is ontvangen.</p><table>'+fields.map(([k,v])=>'<tr><td style="padding:6px 16px 6px 0">'+escapeHtml(k)+'</td><td>'+escapeHtml(v)+'</td></tr>').join('')+'</table><p>Je kunt dit rapport in de SHAKENSTYLE-portal bekijken. Een tweede rapport voor dezelfde dienst is niet mogelijk.</p>';
  const response = await fetch('https://api.resend.com/emails', { method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:[user.email],subject:'Bevestiging shiftrapport · '+assignment.project_name,html}) });
  if (!response.ok) return NextResponse.json({ error:'Bevestigingsmail verzenden mislukt' }, { status: 502 });
  await admin.from('crew_shift_reports').update({ confirmation_email_sent_at: new Date().toISOString() }).eq('id',report.id).is('confirmation_email_sent_at',null);
  return NextResponse.json({ sent:true });
}
