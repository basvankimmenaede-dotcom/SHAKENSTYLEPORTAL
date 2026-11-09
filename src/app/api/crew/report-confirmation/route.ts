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
  const { data: assignment } = await admin.from('crew_portal_assignments').select('id,project_name,rentman_project_id,starts_at,project_location').eq('id',assignmentId).eq('crew_member_id',member.id).maybeSingle();
  if (!assignment) return NextResponse.json({ error: 'Dienst niet gevonden' }, { status: 404 });
  const { data: report } = await admin.from('crew_shift_reports').select('*').eq('assignment_id',assignmentId).eq('crew_member_id',member.id).maybeSingle();
  if (!report) return NextResponse.json({ error: 'Rapport niet gevonden' }, { status: 404 });
  if (report.confirmation_email_sent_at) return NextResponse.json({ sent:true, alreadySent:true });
  const host=process.env.CREW_SMTP_HOST, username=process.env.CREW_SMTP_USER, password=process.env.CREW_SMTP_PASSWORD;
  const port=Number(process.env.CREW_SMTP_PORT || 465);
  if (!host || !username || !password) return NextResponse.json({ error:'Mailserver nog niet ingesteld' }, { status:503 });
  const fmtDate=(v:string)=>new Date(v).toLocaleDateString('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'long',year:'numeric'});
  const fmtTime=(v:string)=>new Date(v).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
  let projectNumber=String(assignment.rentman_project_id||'');
  let invoiceReference='';
  try {
    const token=process.env.RENTMAN_API_TOKEN;
    if(token && assignment.rentman_project_id){
      const response=await fetch('https://api.rentman.net/projects/'+encodeURIComponent(String(assignment.rentman_project_id))+'?fields=id,number,custom',{headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store'});
      if(response.ok){const project=(await response.json()).data; if(project?.number!=null)projectNumber=String(project.number); if(typeof project?.custom?.custom_112==='string')invoiceReference=project.custom.custom_112.trim();}
      else console.error('Invoice reference lookup failed',response.status);
    }
  } catch(error){console.error('Invoice reference lookup unavailable',error);}
  const row=(label:string,value:unknown)=>'<tr><td style="padding:10px 12px;color:#777;vertical-align:top;width:37%">'+escapeHtml(label)+'</td><td style="padding:10px 12px;font-weight:600;vertical-align:top">'+escapeHtml(value)+'</td></tr>';
  const section=(heading:string,rows:string)=>'<h2 style="font-size:19px;margin:28px 0 12px">'+heading+'</h2><table role="presentation" style="border-collapse:collapse;background:#f7f7f7;border-radius:12px;width:100%">'+rows+'</table>';
  const worked=Math.max(0,(new Date(report.work_ended_at).getTime()-new Date(report.work_started_at).getTime())/3600000-Number(report.break_minutes||0)/60);
  const projectRows=row('Projectnummer',projectNumber)+row('Projectnaam',assignment.project_name)+row('Datum',fmtDate(assignment.starts_at))+(assignment.project_location?row('Locatie',assignment.project_location):'');
  const shiftRows=row('Begintijd',fmtTime(report.work_started_at))+row('Eindtijd',fmtTime(report.work_ended_at))+row('Pauze',String(report.break_minutes||0)+' minuten')+row('Reistijd',String(report.travel_minutes||0)+' minuten')+row('Totaal gewerkt',worked.toLocaleString('nl-NL',{maximumFractionDigits:2})+' uur');
  const extraRows=row('Extra kosten','€ '+Number(report.expenses_amount||0).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2}))+(report.expenses_description?row('Toelichting kosten',report.expenses_description):'')+row('Meer dan 10 glazen gebroken',report.breakage_over_ten?'Ja':'Nee')+row('Ontbrekend materiaal',report.missing_materials?'Ja':'Nee')+(report.missing_materials_description?row('Omschrijving ontbrekend materiaal',report.missing_materials_description):'')+row('Notities',report.notes||'—');
  const warning='Gebruik deze factuurvermelding exact zoals hierboven op je factuur. Dit is verplicht. Facturen zonder deze vermelding of met een afwijkende omschrijving kunnen mogelijk niet worden verwerkt.';
  const invoiceBox='<div style="background:#fff0e5;padding:20px;border-radius:12px"><strong style="color:#c94c0b;font-size:12px">FACTUURVERMELDING (VERPLICHT)</strong>'+(invoiceReference?'<p style="font-weight:700;background:white;border-radius:7px;padding:14px;overflow-wrap:anywhere">'+escapeHtml(invoiceReference)+'</p><p style="font-size:13px;line-height:1.6">'+warning+'</p>':'<p style="font-size:13px;line-height:1.6">De factuurvermelding is niet beschikbaar. Vraag de exacte tekst op bij kantoor voordat je factureert. Facturen zonder de juiste vermelding kunnen mogelijk niet worden verwerkt.</p>')+'</div>';
  const html='<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f4f2;font-family:Arial,Helvetica,sans-serif;color:#202020"><div style="max-width:680px;margin:auto;background:#fff"><div style="background:#181614;color:white;padding:35px 28px"><div style="font-size:23px;letter-spacing:5px;font-weight:700">SHAKENSTYLE</div><div style="font-size:10px;letter-spacing:3px;margin-top:8px">DESIGN, BUILD &amp; EXECUTE</div></div><div style="padding:26px 28px"><div style="background:#eff8f0;border-radius:13px;padding:22px"><h1 style="font-size:24px;margin:0 0 10px">✓ Je shiftrapport is ingediend!</h1><p style="font-size:14px;line-height:1.6;margin:0">Bedankt voor je inzet, '+escapeHtml(member.full_name)+'. We hebben je shiftrapport ontvangen. De gegevens worden door ons team gecontroleerd en verwerkt.</p></div>'+section('Projectgegevens',projectRows)+section('Jouw dienst',shiftRows)+'<h2 style="font-size:19px;margin:28px 0 12px">Factuurvermelding (verplicht)</h2>'+invoiceBox+section('Overige informatie',extraRows)+'<div style="border-top:1px solid #e8e5e1;margin-top:30px;padding-top:22px"><strong>Nogmaals bedankt!</strong><p style="color:#777;font-size:13px">Team SHAKENSTYLE</p><p style="font-size:17px;letter-spacing:3px;font-weight:700">SHAKENSTYLE</p><p style="color:#777;font-size:12px">Vragen? crew@shakenstyle.com · www.shakenstyle.com</p></div></div></div></body></html>';
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
