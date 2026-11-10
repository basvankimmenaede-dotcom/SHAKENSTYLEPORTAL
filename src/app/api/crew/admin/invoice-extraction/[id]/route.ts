import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {processInvoiceMessage} from '@/lib/invoice-pdf-extraction';

export const runtime='nodejs';
export const maxDuration=60;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
async function authorization(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 if(!origin||!host||new URL(origin).host!==host||new URL(origin).protocol!=='https:')return false;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return false;
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const permission=await getUserPermissionLevel(client,user.id,'billing');
 return profile?.role==='admin'||permissionAtLeast(permission,'manage');
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!await authorization(request))return NextResponse.json({error:'Geen toestemming.'},{status:403});
 const {id}=await params;
 if(!UUID.test(id))return NextResponse.json({error:'Ongeldige e-mail.'},{status:400});
 const body=await request.json().catch(()=>null);
 const action=body?.action;
 const admin=createAdminClient();
 if(action==='extract'){
  try{
   const result=await processInvoiceMessage(id);
   return NextResponse.json({ok:true,message:result.failed?'PDF-extractie afgerond met aandachtspunten.':'PDF uitgelezen. Controleer de gegevens voordat je de factuur koppelt.'});
  }catch(e){
   console.error('Manual invoice extraction failed',e instanceof Error?e.message:'unknown');
   return NextResponse.json({error:'PDF-verwerking mislukt. Controleer het bericht.'},{status:500});
  }
 }
 if(action==='link'){
  const extractionId=typeof body.extractionId==='string'?body.extractionId:'';
  const memberId=typeof body.memberId==='string'?body.memberId:'';
  const invoiceNumber=typeof body.invoiceNumber==='string'?body.invoiceNumber.trim():'';
  const invoiceDate=typeof body.invoiceDate==='string'?body.invoiceDate.trim():'';
  const amount=typeof body.totalAmount==='number'?body.totalAmount:Number(body.totalAmount);
  if(!UUID.test(extractionId)||!UUID.test(memberId)||!/^[A-Za-z0-9][A-Za-z0-9_/.-]{2,64}$/.test(invoiceNumber))
   return NextResponse.json({error:'Vul een geldig crewlid en factuurnummer in.'},{status:400});
  if(!Number.isFinite(amount)||amount<0||amount>99999999)return NextResponse.json({error:'Controleer het totaalbedrag.'},{status:400});
  if(invoiceDate&&(!/^20\d{2}-\d{2}-\d{2}$/.test(invoiceDate)||Number.isNaN(Date.parse(invoiceDate))))
   return NextResponse.json({error:'Controleer de factuurdatum.'},{status:400});
  const [{data:extraction},{data:member}]=await Promise.all([
   admin.from('invoice_pdf_extractions').select('id,message_id,storage_path,status,linked_invoice_id').eq('id',extractionId).eq('message_id',id).maybeSingle(),
   admin.from('crew_portal_members').select('id,active').eq('id',memberId).maybeSingle()
  ]);
  if(!extraction||extraction.status==='linked'||extraction.linked_invoice_id)
   return NextResponse.json({error:'Deze bijlage is al gekoppeld of niet gevonden.'},{status:409});
  if(!member?.active)return NextResponse.json({error:'Het gekozen crewlid is niet actief.'},{status:409});
  if(!extraction.storage_path.startsWith('incoming/'+id+'/'))
   return NextResponse.json({error:'Ongeldige bestandslocatie.'},{status:400});
  const {data:invoice,error:insertError}=await admin.from('crew_invoices').insert({
   crew_member_id:memberId,invoice_number:invoiceNumber,invoice_date:invoiceDate||null,
   total_amount:amount,status:'received',document_path:extraction.storage_path
  }).select('id').single();
  if(insertError||!invoice){
   return NextResponse.json({error:'Koppelen mislukt. Controleer of deze PDF al gekoppeld is.'},{status:409});
  }
  const {error:updateError}=await admin.from('invoice_pdf_extractions')
   .update({status:'linked',linked_invoice_id:invoice.id,reviewed_at:new Date().toISOString()})
   .eq('id',extractionId).neq('status','linked');
  if(updateError)console.error('PDF linked but extraction update failed',updateError.message);
  await admin.from('invoice_inbox_messages').update({linked_invoice_id:invoice.id}).eq('id',id).is('linked_invoice_id',null);
  return NextResponse.json({ok:true,message:'Factuur gekoppeld aan de bartender. Status: Ontvangen.'});
 }
 return NextResponse.json({error:'Ongeldige actie.'},{status:400});
}
