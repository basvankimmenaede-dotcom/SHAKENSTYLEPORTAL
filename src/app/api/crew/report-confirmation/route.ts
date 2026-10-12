import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
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
  const { data: assignment } = await admin.from('crew_portal_assignments').select('id,project_name').eq('id',assignmentId).eq('crew_member_id',member.id).maybeSingle();
  if (!assignment) return NextResponse.json({ error: 'Dienst niet gevonden' }, { status: 404 });
  const { data: report } = await admin.from('crew_shift_reports').select('*').eq('assignment_id',assignmentId).eq('crew_member_id',member.id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Rapport niet gevonden' }, { status: 404 });
  if (report.confirmation_email_sent_at) return NextResponse.json({ sent:true, alreadySent:true });
  const host=process.env.CREW_SMTP_HOST, username=process.env.CREW_SMTP_USER, password=process.env.CREW_SMTP_PASSWORD;
  const port=Number(process.env.CREW_SMTP_PORT || 465);
  if (!host || !username || !password) return NextResponse.json({ error:'Mailserver nog niet ingesteld' }, { status:503 });
  const fmt=(v:string)=>new Date(v).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const fields:[string,string][]=[
    ['Begin',fmt(report.work_started_at)],['Eind',fmt(report.work_ended_at)],['Pauze',report.break_minutes+' minuten'],['Reistijd',report.travel_minutes+' minuten'],
    ['Onkosten','€ '+Number(report.expenses_amount||0).toLocaleString('nl-NL',{minimumFractionDigits:2})],['Toelichting onkosten',report.expenses_description||'—'],
    ['Meer dan 10 glazen gebroken',report.breakage_over_ten?'Ja':'Nee'],['Ontbrekend materiaal',report.missing_materials?'Ja':'Nee'],
    ['Omschrijving ontbrekend materiaal',report.missing_materials_description||'—'],['Opmerkingen',report.notes||'—']
  ];
  const html='<div style="font-family:Arial,sans-serif;color:#252525;max-width:620px"><h2>Shiftrapport ontvangen</h2><p>Hallo '+escapeHtml(member.full_name)+',</p><p>Je shiftrapport voor <strong>'+escapeHtml(assignment.project_name)+'</strong> is ingediend.</p><table style="border-collapse:collapse;width:100%">'+fields.map(([k,v])=>'<tr><td style="padding:9px;border-bottom:1px solid #eee;color:#777">'+escapeHtml(k)+'</td><td style="padding:9px;border-bottom:1px solid #eee">'+escapeHtml(v)+'</td></tr>').join('')+'</table><p>Je kunt het rapport in de portal terugzien. Het is niet opnieuw in te dienen.</p><p>SHAKENSTYLE Crew</p></div>';
  try {
    const transport=nodemailer.createTransport({host,port,secure:port===465,auth:{user:username,pass:password}});
    await transport.sendMail({from:{name:'SHAKENSTYLE Crew',address:'crew@shakenstyle.com'},to:user.email,subject:'Bevestiging shiftrapport · '+assignment.project_name,html});
    const { error }=await admin.from('crew_shift_reports').update({confirmation_email_sent_at:new Date().toISOString()}).eq('id',report.id).is('confirmation_email_sent_at',null);
    if(error) console.error('Confirmation email sent but status update failed',error.message);
    return NextResponse.json({sent:true});
  } catch(error) {
    console.error('Crew confirmation SMTP failed',error instanceof Error?error.message:'unknown');
    return NextResponse.json({error:'Verzenden via crew@shakenstyle.com mislukt. Probeer later opnieuw.'},{status:502});
  }
}
