import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserPermissionLevel, permissionAtLeast } from '@/lib/auth';

export const runtime='nodejs';
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Niet ingelogd'},{status:401});
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  const level=await getUserPermissionLevel(supabase,user.id,'billing');
  if(profile?.role!=='admin'&&!permissionAtLeast(level,'manage'))
    return NextResponse.json({error:'Geen toestemming voor correctieverzoeken'},{status:403});

  const {id}=await context.params;
  if(!isUuid(id))return NextResponse.json({error:'Ongeldige factuur'},{status:400});
  const body=await request.json().catch(()=>null);
  const reason=typeof body?.reason==='string'?body.reason.trim():'';
  if(reason.length<8||reason.length>1500)
    return NextResponse.json({error:'Vul een duidelijke correctiereden in (8-1500 tekens).'},{status:400});

  const host=process.env.CREW_SMTP_HOST,username=process.env.CREW_SMTP_USER,password=process.env.CREW_SMTP_PASSWORD;
  const port=Number(process.env.CREW_SMTP_PORT||465);
  if(!host||!username||!password||!Number.isSafeInteger(port)||port<1||port>65535)
    return NextResponse.json({error:'De e-mailinstellingen zijn niet compleet.'},{status:503});

  const admin=createAdminClient();
  const {data:invoice,error:invoiceError}=await admin.from('crew_invoices')
    .select('id,crew_member_id,invoice_number,status,correction_reason').eq('id',id).maybeSingle();
  if(invoiceError||!invoice)return NextResponse.json({error:'Factuur niet gevonden'},{status:404});
  if(!['received','in_review'].includes(invoice.status))
    return NextResponse.json({error:'Voor deze factuur kan geen nieuw correctieverzoek worden verzonden.'},{status:409});

  const {data:member}=await admin.from('crew_portal_members')
    .select('full_name,email,login_email_override,active').eq('id',invoice.crew_member_id).maybeSingle();
  const recipient=String(member?.login_email_override||member?.email||'').trim().toLowerCase();
  if(!member?.active||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    return NextResponse.json({error:'Er is geen actief e-mailadres gekoppeld aan deze bartender.'},{status:409});

  // Compare-and-set is a lock against duplicate requests from separate administrators.
  const {data:claimed,error:lockError}=await admin.from('crew_invoices')
    .update({status:'correction_sending',correction_reason:reason,updated_at:new Date().toISOString()})
    .eq('id',id).eq('status',invoice.status).select('id').maybeSingle();
  if(lockError||!claimed)return NextResponse.json({error:'De factuur wordt al verwerkt. Vernieuw het overzicht.'},{status:409});

  const firstName=(member.full_name||'collega').trim().split(/\s+/)[0];
  const html='<div style="max-width:620px;font-family:Arial,sans-serif;color:#222;margin:auto"><div style="background:#191919;color:#fff;padding:22px;font-size:21px;font-weight:bold;letter-spacing:3px">SHAKENSTYLE</div><div style="padding:24px"><p>Hi '+escapeHtml(firstName)+',</p><p>We hebben je factuur <strong>'+escapeHtml(invoice.invoice_number)+'</strong> ontvangen, maar deze moet worden aangepast.</p><p><strong>Wat moet worden aangepast?</strong></p><div style="white-space:pre-wrap;background:#fff1e7;padding:15px;border-radius:10px">'+escapeHtml(reason)+'</div><p>Stuur de aangepaste factuur opnieuw per e-mail naar het gebruikelijke factuuradres.</p><p>Je ziet dezelfde toelichting in je SHAKENSTYLE Crew Portal.</p><p>Bedankt!<br>Team SHAKENSTYLE</p></div></div>';
  try{
    const transport=nodemailer.createTransport({host,port,secure:port===465,auth:{user:username,pass:password}});
    await transport.sendMail({from:{name:'SHAKENSTYLE Crew',address:'crew@shakenstyle.com'},
      to:recipient,
      subject:'Correctie nodig - Factuur '+invoice.invoice_number+' | SHAKENSTYLE',
      html,text:'Hi '+firstName+',\n\nJe factuur '+invoice.invoice_number+' moet worden aangepast.\n\nReden:\n'+reason+'\n\nStuur je aangepaste factuur opnieuw per e-mail naar het gebruikelijke factuuradres.\n\nTeam SHAKENSTYLE'});
  }catch(error){
    console.error('Correctiemail versturen mislukt',error instanceof Error?error.message:'onbekend');
    // Keep correction_sending when mail delivery is uncertain: never risk duplicate automated mail.
    return NextResponse.json({error:'Verzending niet bevestigd. Status blijft geblokkeerd voor dubbele mails; beheer moet dit controleren.'},{status:502});
  }
  const {error:finishError}=await admin.from('crew_invoices')
    .update({status:'correction_needed',correction_notified_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq('id',id).eq('status','correction_sending');
  if(finishError){
    console.error('Correctiemail verzonden maar status bijwerken mislukt',finishError.message);
    return NextResponse.json({error:'E-mail is verzonden, maar de factuurstatus kon niet worden bijgewerkt. Beheer moet dit controleren.'},{status:502});
  }
  return NextResponse.json({ok:true});
}
