
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {archiveInvoiceEmailWhenReviewed} from '@/lib/invoice-attachment-review';

export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
function sameOrigin(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 try{return Boolean(origin&&host&&new URL(origin).host===host&&new URL(origin).protocol==='https:');}
 catch{return false;}
}
async function canReview(req:NextRequest){
 if(!sameOrigin(req))return null;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return null;
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const level=await getUserPermissionLevel(client,user.id,'billing');
 return profile?.role==='admin'||permissionAtLeast(level,'manage')?user:null;
}
function cleanDate(value:unknown){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:false;
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await canReview(req);
 if(!user)return NextResponse.json({error:'Geen toestemming.'},{status:403});
 const {id}=await params;
 if(!UUID.test(id))return NextResponse.json({error:'Ongeldige bijlage.'},{status:400});
 const body=await req.json().catch(()=>null);
 const action=body?.action;
 const db=createAdminClient();
 const {data:extraction,error:loadError}=await db.from('invoice_pdf_extractions')
  .select('id,message_id,attachment_index,storage_path,status,linked_invoice_id,supplier_name,total_amount,invoice_date,project_numbers')
  .eq('id',id).maybeSingle();
 if(loadError||!extraction)return NextResponse.json({error:'Bijlage niet gevonden.'},{status:404});
 if(action==='reopen'){
  const {data:review}=await db.from('invoice_attachment_reviews')
   .select('id,billing_status').eq('extraction_id',id).maybeSingle();
  if(!review)return NextResponse.json({error:'Deze bijlage heeft nog geen keuze.'},{status:409});
  if(review.billing_status==='included')return NextResponse.json({error:'Haal dit bonnetje eerst uit de klantcalculatie voordat je de keuze terugdraait.'},{status:409});
  const {error}=await db.from('invoice_attachment_reviews').delete().eq('id',review.id).neq('billing_status','included');
  if(error)return NextResponse.json({error:'Keuze herstellen mislukt.'},{status:500});
  await db.from('invoice_inbox_messages').update({archived_at:null,archive_reason:null})
   .eq('id',extraction.message_id).eq('archive_reason','all_attachments_reviewed');
  return NextResponse.json({ok:true,message:'Bijlage opnieuw ter beoordeling geopend.'});
 }
 if(action!=='classify')return NextResponse.json({error:'Ongeldige actie.'},{status:400});
 if(extraction.status==='linked'||extraction.linked_invoice_id)
  return NextResponse.json({error:'Een gekoppelde factuur kan niet opnieuw als bonnetje worden verwerkt.'},{status:409});
 const kind=body?.kind;
 if(!['receipt','evidence','ignored'].includes(kind))
  return NextResponse.json({error:'Kies bonnetje, bewijsstuk of niet relevant.'},{status:400});
 const project=typeof body?.projectNumber==='string'?body.projectNumber.trim():'';
 const note=typeof body?.note==='string'?body.note.trim().slice(0,500):'';
 const merchant=typeof body?.merchant==='string'?body.merchant.trim().slice(0,150):'';
 const date=cleanDate(body?.documentDate);
 const amount=body?.amount===''||body?.amount==null?null:Number(body.amount);
 const linkedInvoiceId=typeof body?.linkedInvoiceId==='string'?body.linkedInvoiceId:'';
 if((project&&!/^\d{4,8}$/.test(project))||date===false||amount!==null&&(!Number.isFinite(amount)||amount<0||amount>1000000))
  return NextResponse.json({error:'Controleer projectnummer, datum en bonbedrag.'},{status:400});
 if(kind==='receipt'&&(!merchant||amount===null))
  return NextResponse.json({error:'Vul voor het bonnetje een winkel en een bonbedrag in.'},{status:400});
 if(kind==='ignored'&&note.length<5)
  return NextResponse.json({error:'Vul een reden in (minimaal 5 tekens).'},{status:400});
 if(kind==='evidence'&&!UUID.test(linkedInvoiceId))
  return NextResponse.json({error:'Kies de factuur waaraan het bewijsstuk gekoppeld wordt.'},{status:400});
 if(linkedInvoiceId){
  if(!UUID.test(linkedInvoiceId))return NextResponse.json({error:'Ongeldige factuurkoppeling.'},{status:400});
  const {data:linked}=await db.from('invoice_pdf_extractions')
   .select('id').eq('message_id',extraction.message_id).eq('linked_invoice_id',linkedInvoiceId).limit(1).maybeSingle();
  if(!linked)return NextResponse.json({error:'De factuur hoort niet bij dezelfde e-mail.'},{status:409});
 }
 if(!extraction.storage_path.startsWith('incoming/'+extraction.message_id+'/'))
  return NextResponse.json({error:'Ongeldige bestandslocatie.'},{status:400});
 const {error}=await db.from('invoice_attachment_reviews').insert({
  extraction_id:id,message_id:extraction.message_id,attachment_index:extraction.attachment_index,
  classification:kind,merchant:merchant||null,document_date:date||null,
  cost_amount:amount===null?null:Math.round(amount*100)/100,
  project_number:kind==='receipt'?(project||null):null,
  linked_invoice_id:linkedInvoiceId||null,note:note||null,
  billing_status:kind==='receipt'?'pending':'not_bill',reviewed_by:user.id
 });
 if(error){
  if(error.code==='23505')return NextResponse.json({error:'Deze bijlage is al afgehandeld.'},{status:409});
  console.error('Attachment classification failed',error.message);
  return NextResponse.json({error:'Bijlage opslaan mislukt.'},{status:500});
 }
 let archived=false;
 try{archived=await archiveInvoiceEmailWhenReviewed(extraction.message_id);}
 catch(e){console.error('Archive check failed',e);}
 const message=kind==='receipt'?'Bonnetje bewaard als mogelijke projectkosten.':
  kind==='evidence'?'Bewijsstuk aan de bestaande factuur gekoppeld.':'Bijlage als niet relevant geregistreerd.';
 return NextResponse.json({ok:true,message:message+(archived?' E-mail volledig afgehandeld en gearchiveerd.':'')});
}
