import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import nodemailer from 'nodemailer';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {getInvoiceProcessingSettings,invoiceEmailPattern,uuidPattern} from '@/lib/invoice-processing-settings';
import {loadCrewInvoiceComparisons} from '@/lib/invoice-comparison-loader';
import {getInvoiceApprovalBlockReason} from '@/lib/invoice-shift-comparison';

export const runtime='nodejs';
export const maxDuration=60;
function sameOrigin(request:NextRequest){
 try{return new URL(request.headers.get('origin')||'invalid').host===request.headers.get('host')
  &&new URL(request.headers.get('origin')||'invalid').protocol==='https:';}catch{return false;}
}
function escapeHtml(input:string){return input.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]||x));}
async function logEvent(invoiceId:string,actorId:string,action:string,description:string){
 const {error}=await createAdminClient().from('invoice_approval_audit').insert({
  invoice_id:invoiceId,actor_id:actorId,action,description
 });
 if(error)console.error('Invoice audit log insert failed',error.message);
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Niet ingelogd.'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const permission=await getUserPermissionLevel(supabase,user.id,'billing');
 if(profile?.role!=='admin'&&!permissionAtLeast(permission,'manage'))
  return NextResponse.json({error:'Je hebt geen rechten om facturen goed te keuren.'},{status:403});
 const {id}=await params;
 if(!uuidPattern.test(id))return NextResponse.json({error:'Ongeldig factuur-ID.'},{status:400});
 const admin=createAdminClient();
 const settings=await getInvoiceProcessingSettings();
 if(!settings.approver_one||!settings.approver_two||settings.approver_one===settings.approver_two||!invoiceEmailPattern.test(settings.forward_email))
  return NextResponse.json({error:'Stel eerst twee verschillende goedkeurders en een boekhoudadres in bij Factuurverwerking.'},{status:409});
 const {data:invoice,error:loadError}=await admin.from('crew_invoices')
  .select('id,crew_member_id,invoice_number,invoice_date,total_amount,status,document_path,approved_first_by,approved_second_by,approval_policy_one,approval_policy_two,forward_to,forward_attempted_at,forwarded_at,project_numbers,project_lines')
  .eq('id',id).maybeSingle();
 if(loadError||!invoice)return NextResponse.json({error:'Factuur niet gevonden.'},{status:404});
 if(invoice.status==='approved')return NextResponse.json({error:'Deze factuur is al goedgekeurd en doorgestuurd.'},{status:409});
 if(!['received','in_review'].includes(invoice.status))
  return NextResponse.json({error:'Deze factuur wacht op een correctie of is niet klaar voor goedkeuring.'},{status:409});
 if(!invoice.document_path||!invoice.document_path.startsWith('incoming/')||!invoice.document_path.endsWith('.pdf'))
  return NextResponse.json({error:'Geen geldig origineel PDF-bestand gevonden.'},{status:409});
 // Re-check on the server for both approvals. UI warnings can be bypassed, and shift reports may change.
 let check;
 try{
  const comparisons=await loadCrewInvoiceComparisons([{
   id:invoice.id,crew_member_id:invoice.crew_member_id,
   project_numbers:invoice.project_numbers,project_lines:invoice.project_lines
  }]);
  check=comparisons[invoice.id];
 }catch(error){
  console.error('Invoice approval comparison could not be loaded',error instanceof Error?error.message:'unknown');
  return NextResponse.json({error:'De vergelijking met shiftrapporten is tijdelijk niet beschikbaar. De factuur is niet goedgekeurd.'},{status:503});
 }
 const blockReason=getInvoiceApprovalBlockReason(check||{status:'unverified',projects:[]});
 if(blockReason)return NextResponse.json({error:blockReason},{status:409});
 const now=new Date().toISOString();
 if(!invoice.approved_first_by){
  if(![settings.approver_one,settings.approver_two].includes(user.id))
   return NextResponse.json({error:'Je bent niet als goedkeurder geselecteerd.'},{status:403});
  const {data:updated,error}=await admin.from('crew_invoices').update({
   approved_first_by:user.id,approval_policy_one:settings.approver_one,
   approval_policy_two:settings.approver_two,forward_to:settings.forward_email,
   status:'in_review',updated_at:now
  }).eq('id',id).is('approved_first_by',null).is('approved_second_by',null)
   .in('status',['received','in_review']).select('id').maybeSingle();
  if(error||!updated)return NextResponse.json({error:'Deze factuur is ondertussen gewijzigd. Vernieuw het scherm.'},{status:409});
  await logEvent(id,user.id,'first_approved','Eerste akkoord, tweede goedkeurder moet nog akkoord geven.');
  return NextResponse.json({ok:true,message:'Eerste goedkeuring vastgelegd. De andere goedkeurder moet nu akkoord geven.'});
 }
 if(invoice.approved_first_by===user.id)return NextResponse.json({error:'Een factuur moet door twee verschillende accounts worden goedgekeurd.'},{status:403});
 if(!invoice.approval_policy_one||!invoice.approval_policy_two
   ||![invoice.approval_policy_one,invoice.approval_policy_two].includes(user.id))
  return NextResponse.json({error:'Je bent niet geselecteerd voor de tweede goedkeuring van deze factuur.'},{status:403});
 if(invoice.approved_second_by||invoice.forward_attempted_at)
  return NextResponse.json({error:'Tweede akkoord of verzending is al in behandeling. Controleer de verzendstatus.'},{status:409});
 if(!invoice.forward_to||!invoiceEmailPattern.test(invoice.forward_to))
  return NextResponse.json({error:'Doorstuuradres ontbreekt bij deze factuur.'},{status:409});
 const host=process.env.CREW_SMTP_HOST,username=process.env.CREW_SMTP_USER,password=process.env.CREW_SMTP_PASSWORD;
 const port=Number(process.env.CREW_SMTP_PORT||465);
 if(!host||!username||!password||!Number.isInteger(port)||port<1||port>65535)
  return NextResponse.json({error:'De SMTP-instellingen zijn niet compleet.'},{status:503});
 // Validate file and load it before marking this second approval as a one-shot sending attempt.
 const {data:file,error:fileError}=await admin.storage.from('incoming-invoices').download(invoice.document_path);
 if(fileError||!file)return NextResponse.json({error:'De originele PDF kan niet worden geladen.'},{status:503});
 const attachment=Buffer.from(await file.arrayBuffer());
 if(attachment.length>15*1024*1024||attachment.subarray(0,5).toString()!=='%PDF-')
  return NextResponse.json({error:'De originele PDF is te groot of beschadigd.'},{status:503});
 const {data:member}=await admin.from('crew_portal_members').select('full_name').eq('id',invoice.crew_member_id).maybeSingle();
 const {data:linkedPdf}=await admin.from('invoice_pdf_extractions').select('filename').eq('linked_invoice_id',id).limit(1).maybeSingle();
 const filename=(String(linkedPdf?.filename||'Factuur-'+invoice.invoice_number+'.pdf')).replace(/[^\w. -]/g,'_').slice(0,100);
 // Conditional update prevents another server invocation sending twice. In ambiguous SMTP failures,
 // never automatically retry because the message may have already been accepted by the mail server.
 const {data:locked,error:lockError}=await admin.from('crew_invoices').update({
  approved_second_by:user.id,forward_attempted_at:now,forward_error:null,updated_at:now
 }).eq('id',id).eq('approved_first_by',invoice.approved_first_by)
  .is('approved_second_by',null).is('forward_attempted_at',null)
  .eq('status','in_review').select('id').maybeSingle();
 if(lockError||!locked)return NextResponse.json({error:'De tweede goedkeuring is al in behandeling.'},{status:409});
 await logEvent(id,user.id,'second_approved','Tweede akkoord; originele PDF wordt doorgestuurd.');
 const messageId='<invoice-'+createHash('sha256').update(id).digest('hex').slice(0,28)+'@shakenstyle.com>';
 const name=String(member?.full_name||'Crewlid');
 const subject='Goedgekeurde factuur '+invoice.invoice_number+' | SHAKENSTYLE';
 const description='Factuur: '+invoice.invoice_number+'\nCrewlid: '+name+'\nBedrag: '+Number(invoice.total_amount||0).toFixed(2)+' EUR\nGoedkeuringen: 2\n\nOriginele factuur als PDF bijgevoegd.';
 try{
  const smtp=nodemailer.createTransport({host,port,secure:port===465,auth:{user:username,pass:password},
   connectionTimeout:15000,greetingTimeout:15000,socketTimeout:25000});
  const receipt=await smtp.sendMail({
   from:{name:'SHAKENSTYLE Facturen',address:username},to:invoice.forward_to,
   messageId,subject,text:description,
   html:'<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Goedgekeurde factuur</h2><p>Factuur <strong>'+
    escapeHtml(invoice.invoice_number)+'</strong> van '+escapeHtml(name)+' is door twee accounts goedgekeurd.</p>'+
    '<p>De originele factuur is bijgevoegd.</p><p>SHAKENSTYLE</p></div>',
   attachments:[{filename,content:attachment,contentType:'application/pdf'}]
  });
  const forwardedAt=new Date().toISOString();
  const {error:updateError}=await admin.from('crew_invoices').update({
   status:'approved',forwarded_at:forwardedAt,forward_message_id:receipt.messageId||messageId,
   forward_error:null,updated_at:forwardedAt
  }).eq('id',id).eq('approved_second_by',user.id).eq('forward_attempted_at',now);
  if(updateError)throw new Error('SMTP verzending bevestigd, maar de factuurstatus kon niet worden opgeslagen.');
  await logEvent(id,user.id,'forwarded','Originele PDF doorgestuurd na twee goedkeuringen.');
  return NextResponse.json({ok:true,message:'Tweede goedkeuring voltooid. De PDF is doorgestuurd naar de boekhouding.'});
 }catch(error){
  const detail=error instanceof Error?error.message:'Onbekende SMTP-fout';
  console.error('Invoice forwarding needs reconciliation',detail.slice(0,250));
  await admin.from('crew_invoices').update({
   forward_error:'Verzending niet bevestigd; controleer eerst de boekhoudmailbox voordat je opnieuw verstuurt.',
   updated_at:new Date().toISOString()
  }).eq('id',id).eq('approved_second_by',user.id);
  await logEvent(id,user.id,'forward_needs_review','SMTP-verzending kon niet betrouwbaar worden bevestigd.');
  return NextResponse.json({error:'Tweede akkoord is opgeslagen, maar doorsturen kon niet worden bevestigd. Controleer de boekhouding om dubbele verzending te voorkomen.'},{status:502});
 }
}
