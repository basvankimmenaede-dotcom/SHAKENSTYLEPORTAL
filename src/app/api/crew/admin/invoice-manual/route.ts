import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {INVOICE_SUPPLIER_CATEGORIES} from '@/lib/invoice-suppliers';

export const runtime='nodejs';
export const maxDuration=60;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES=15*1024*1024;
function sameOrigin(req:NextRequest){
 try{
  const origin=new URL(req.headers.get('origin')||'invalid');
  return origin.protocol==='https:'&&origin.host===req.headers.get('host');
 }catch{return false;}
}
async function canManage(request:NextRequest){
 if(!sameOrigin(request))return false;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return false;
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const permission=await getUserPermissionLevel(client,user.id,'billing');
 return profile?.role==='admin'||permissionAtLeast(permission,'manage');
}
const pathFor=(uploadId:string)=>'incoming/'+uploadId+'/0-'+uploadId+'.pdf';
export async function POST(request:NextRequest){
 if(!await canManage(request))return NextResponse.json({error:'Geen toestemming.'},{status:403});
 const body=await request.json().catch(()=>null);
 const action=body?.action;
 const receipt=body?.sourceType==='receipt';
 const ocrText=typeof body?.ocrText==='string'?body.ocrText.trim().slice(0,10000):'';
 const db=createAdminClient();
 if(action==='prepare'){
  const uploadId=randomUUID();
  const path=pathFor(uploadId);
  const {data,error}=await db.storage.from('incoming-invoices').createSignedUploadUrl(path);
  if(error||!data?.token)return NextResponse.json({error:'Upload voorbereiden is mislukt.'},{status:503});
  return NextResponse.json({ok:true,uploadId,path,token:data.token});
 }
 if(action!=='save')return NextResponse.json({error:'Ongeldige actie.'},{status:400});
 const uploadId=typeof body.uploadId==='string'?body.uploadId:'';
 const supplierId=typeof body.supplierId==='string'?body.supplierId:'';
 const category=typeof body.costCategory==='string'?body.costCategory:'';
 const number=typeof body.invoiceNumber==='string'?body.invoiceNumber.trim():'';
 const date=typeof body.invoiceDate==='string'?body.invoiceDate.trim():'';
 const amount=typeof body.totalAmount==='number'?body.totalAmount:NaN;
 const project=typeof body.projectNumber==='string'?body.projectNumber.trim():'';
 if(!UUID.test(uploadId)||!UUID.test(supplierId)||
  !INVOICE_SUPPLIER_CATEGORIES.includes(category as typeof INVOICE_SUPPLIER_CATEGORIES[number])||
  !/^[A-Za-z0-9][A-Za-z0-9_/.-]{0,63}$/.test(number)||
  (receipt&&!date)||
  (date&&(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))))||
  !Number.isFinite(amount)||amount<0||amount>99999999||
  (project&&!/^\d{4,8}$/.test(project)))
  return NextResponse.json({error:'Controleer leverancier, factuurnummer, bedrag, datum en projectnummer.'},{status:400});
 const {data:supplier,error:supplierError}=await db.from('invoice_suppliers')
  .select('id,company_name,active').eq('id',supplierId).maybeSingle();
 if(supplierError||!supplier?.active)return NextResponse.json({error:'Kies een actieve leverancier.'},{status:400});
 const {data:existing,error:duplicateError}=await db.from('crew_invoices')
  .select('id,invoice_number').eq('supplier_id',supplierId).ilike('invoice_number',number).limit(1).maybeSingle();
 if(duplicateError)return NextResponse.json({error:'Dubbele factuurcontrole niet beschikbaar.'},{status:503});
 if(existing)return NextResponse.json({error:'Dit factuurnummer of deze bon is al geregistreerd voor deze leverancier.'},{status:409});
 // Camera photos of the same printed receipt produce different file hashes.
 // Flag matching date + total as a possible duplicate, but allow an explicit override.
 if(receipt&&date&&!body.allowSimilarReceipt){
  const {data:similar,error:similarError}=await db.from('crew_invoices')
   .select('id').eq('supplier_id',supplierId).eq('invoice_date',date)
   .eq('total_amount',amount).limit(1).maybeSingle();
  if(similarError)return NextResponse.json({error:'De controle op dubbele bonnen is tijdelijk niet beschikbaar.'},{status:503});
  if(similar)return NextResponse.json({
   error:'Er staat al een bon of factuur van deze leverancier met dezelfde datum en hetzelfde bedrag. Controleer of het echt een andere aankoop is.',
   code:'POSSIBLE_DUPLICATE'
  },{status:409});
 }
 const path=pathFor(uploadId);
 const {data:file,error:fileError}=await db.storage.from('incoming-invoices').download(path);
 if(fileError||!file)return NextResponse.json({error:'De PDF is nog niet geüpload.'},{status:400});
 if(file.size<10||file.size>MAX_PDF_BYTES)return NextResponse.json({error:'PDF moet kleiner zijn dan 15 MB.'},{status:400});
 const bytes=Buffer.from(await file.arrayBuffer());
 if(bytes.subarray(0,5).toString('ascii')!=='%PDF-')
  return NextResponse.json({error:'Dit is geen geldig PDF-bestand.'},{status:400});
 const {data:claimed}=await db.from('invoice_inbox_messages').select('id').eq('id',uploadId).maybeSingle();
 if(claimed)return NextResponse.json({error:'Deze PDF is al geregistreerd.'},{status:409});
 const {data:invoice,error:invoiceError}=await db.from('crew_invoices').insert({
  supplier_id:supplierId,crew_member_id:null,cost_category:category,invoice_number:number,
  invoice_date:date||null,total_amount:amount,status:'received',document_path:path,
  project_numbers:project?[project]:[],project_lines:[]
 }).select('id').single();
 if(invoiceError||!invoice){
  if(invoiceError?.code==='23505')return NextResponse.json({error:'Dit factuurnummer is al geregistreerd voor deze leverancier.'},{status:409});
  console.error('Manual supplier invoice create',invoiceError?.message);
  return NextResponse.json({error:'Handmatige factuur opslaan is mislukt.'},{status:500});
 }
 const filename=(receipt?'Bon-':'Factuur-')+number.replace(/[^A-Za-z0-9_.-]/g,'_')+'.pdf';
 const now=new Date().toISOString();
 const {error:messageError}=await db.from('invoice_inbox_messages').insert({
  id:uploadId,mailbox_key:'manual',uid_validity:'manual',imap_uid:Date.now()*1000+Math.floor(Math.random()*1000),
  message_id:'manual-'+uploadId,sender:null,subject:'Handmatig toegevoegd: '+supplier.company_name,
  received_at:now,status:'matched',
  attachments:[{filename,path,size:bytes.length}],linked_invoice_id:invoice.id,
  archived_at:now,archive_reason:'linked'
 });
 if(messageError){
  console.error('Manual supplier invoice message',messageError.message);
  await db.from('crew_invoices').delete().eq('id',invoice.id);
  return NextResponse.json({error:'Opslaan mislukt. Probeer opnieuw.'},{status:500});
 }
 const {error:extractionError}=await db.from('invoice_pdf_extractions').insert({
  message_id:uploadId,attachment_index:0,filename,storage_path:path,status:'linked',
  processing_provider:receipt?(ocrText?'receipt_ocr':'manual_receipt'):'manual',
  text_preview:ocrText||null,invoice_number:number,invoice_date:date||null,total_amount:amount,
  supplier_name:supplier.company_name,linked_invoice_id:invoice.id,
  project_numbers:project?[project]:[],project_lines:[],reviewed_at:now,
  match_strength:'none',match_reason:receipt?'Kassabon: handmatige verificatie door kantoor vereist.':'Handmatig toegevoegd door kantoor.'
 });
 if(extractionError){
  console.error('Manual supplier invoice extraction',extractionError.message);
  await db.from('invoice_inbox_messages').delete().eq('id',uploadId);
  await db.from('crew_invoices').delete().eq('id',invoice.id);
  return NextResponse.json({error:'Factuurregistratie kon niet worden afgerond.'},{status:500});
 }
 return NextResponse.json({ok:true,message:receipt?'Bon toegevoegd. De originele foto is als PDF bewaard; controle en dubbele goedkeuring zijn vereist.':'Handmatige leveranciersfactuur toegevoegd. De factuur staat klaar voor dubbele goedkeuring.'});
}
