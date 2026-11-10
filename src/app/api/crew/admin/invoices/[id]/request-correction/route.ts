import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserPermissionLevel, permissionAtLeast } from '@/lib/auth';
import {getInvoiceProcessingSettings} from '@/lib/invoice-processing-settings';
import {canDeclineInvoice} from '@/lib/invoice-decision';

export const runtime='nodejs';
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  let validOrigin=false;
  try{const origin=new URL(request.headers.get('origin')||'invalid');validOrigin=origin.protocol==='https:'&&origin.host===request.headers.get('host');}catch{}
  if(!validOrigin)return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});
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
    .select('id,crew_member_id,supplier_id,invoice_number,status,correction_reason,approved_first_by,approved_second_by,approval_policy_one,approval_policy_two,forward_attempted_at,forwarded_at').eq('id',id).maybeSingle();
  if(invoiceError||!invoice)return NextResponse.json({error:'Factuur niet gevonden'},{status:404});
  const config=await getInvoiceProcessingSettings();
  if(!canDeclineInvoice(invoice,user.id,true,config.approver_one,config.approver_two))
    return NextResponse.json({error:'Alleen een bevoegde goedkeurder mag een nog niet doorgestuurde factuur terugsturen.'},{status:403});

  const {data:member}=invoice.crew_member_id?await admin.from('crew_portal_members')
    .select('full_name,email,rentman_email,invoice_email,login_email_override').eq('id',invoice.crew_member_id).maybeSingle():{data:null};
  const {data:supplier}=invoice.supplier_id?await admin.from('invoice_suppliers')
    .select('company_name,contact_email').eq('id',invoice.supplier_id).maybeSingle():{data:null};
  // A supplier receives the correction at its configured invoice mailbox, never the crew portal.
  const recipient=String(invoice.supplier_id?supplier?.contact_email:
    member?.invoice_email||member?.login_email_override||member?.email||member?.rentman_email||'').trim().toLowerCase();
  if((invoice.supplier_id?!supplier:!member)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    return NextResponse.json({error:'Er is geen geldig factuur- of contact-e-mailadres voor deze afzender bekend.'},{status:409});

  // Compare-and-set is a lock against duplicate requests from separate administrators.
  let lock=admin.from('crew_invoices')
    .update({status:'correction_sending',correction_reason:reason,approved_first_by:null,updated_at:new Date().toISOString()})
    .eq('id',id).eq('status',invoice.status).is('approved_second_by',null)
    .is('forward_attempted_at',null).is('forwarded_at',null);
  lock=invoice.approved_first_by?lock.eq('approved_first_by',invoice.approved_first_by):lock.is('approved_first_by',null);
  const {data:claimed,error:lockError}=await lock.select('id').maybeSingle();
  if(lockError||!claimed)return NextResponse.json({error:'De factuur wordt al verwerkt. Vernieuw het overzicht.'},{status:409});

  const firstName=invoice.supplier_id?'':String(member?.full_name||'collega').trim().split(/\s+/)[0];
  const greeting=invoice.supplier_id?'Hi,':'Hi '+escapeHtml(firstName)+',';
  const html='<div style="max-width:620px;font-family:Arial,sans-serif;color:#222;margin:auto"><div style="background:#191919;color:#fff;padding:22px;font-size:21px;font-weight:bold;letter-spacing:3px">SHAKENSTYLE</div><div style="padding:24px"><p>'+greeting+'</p><p>We hebben je factuur <strong>'+escapeHtml(invoice.invoice_number)+'</strong> ontvangen, maar deze moet worden aangepast.</p><p><strong>Wat moet worden aangepast?</strong></p><div style="white-space:pre-wrap;background:#fff1e7;padding:15px;border-radius:10px">'+escapeHtml(reason)+'</div><p>Stuur de aangepaste factuur opnieuw per e-mail naar het gebruikelijke factuuradres.</p>'+(invoice.supplier_id?'':'<p>Je ziet dezelfde toelichting in je SHAKENSTYLE Crew Portal.</p>')+'<p>Bedankt!<br>Team SHAKENSTYLE</p></div></div>';
  try{
    const transport=nodemailer.createTransport({host,port,secure:port===465,auth:{user:username,pass:password}});
    await transport.sendMail({from:invoice.supplier_id?{name:'SHAKENSTYLE Facturen',address:username}:{name:'SHAKENSTYLE Crew',address:'crew@shakenstyle.com'},
      to:recipient,
      subject:'Correctie nodig - Factuur '+invoice.invoice_number+' | SHAKENSTYLE',
      html,text:(invoice.supplier_id?'Hi,':'Hi '+firstName+',')+'\n\nJe factuur '+invoice.invoice_number+' moet worden aangepast.\n\nReden:\n'+reason+'\n\nStuur je aangepaste factuur opnieuw per e-mail naar het gebruikelijke factuuradres.\n\nTeam SHAKENSTYLE'});
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
  const {error:auditError}=await admin.from('invoice_approval_audit').insert({
    invoice_id:id,actor_id:user.id,action:'correction_requested',
    description:'Correctie gevraagd; eerder eerste akkoord ingetrokken. Reden: '+reason
  });
  if(auditError)console.error('Invoice correction audit failed',auditError.message);
  return NextResponse.json({ok:true,message:'Correctieverzoek verstuurd. Het eerdere akkoord is ingetrokken.'});
}
