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
 if(action==='prepare'){
  const index=Number(body?.attachmentIndex);
  if(!Number.isInteger(index)||index<0||index>9)
   return NextResponse.json({error:'Ongeldige bijlage.'},{status:400});
  const {data:message,error:messageError}=await admin.from('invoice_inbox_messages')
   .select('attachments').eq('id',id).maybeSingle();
  if(messageError||!message)return NextResponse.json({error:'E-mail niet gevonden.'},{status:404});
  const attachments=Array.isArray(message.attachments)?message.attachments as {path?:string;filename?:string;size?:number}[]:[];
  const attachment=attachments[index];
  if(!attachment?.path?.startsWith('incoming/'+id+'/')||!attachment.path.endsWith('.pdf'))
   return NextResponse.json({error:'PDF-bijlage niet gevonden.'},{status:404});
  const {data:existing}=await admin.from('invoice_pdf_extractions')
   .select('id,status').eq('message_id',id).eq('attachment_index',index).maybeSingle();
  if(existing?.status==='linked')return NextResponse.json({error:'Deze factuur is al gekoppeld.'},{status:409});
  if(existing&&existing.status!=='failed')
   return NextResponse.json({ok:true,message:'Deze PDF kan al handmatig worden beoordeeld.'});
  const payload={
   message_id:id,attachment_index:index,filename:String(attachment.filename||'Factuur.pdf').slice(0,180),
   storage_path:attachment.path,processing_provider:'manual',status:'needs_review',
   extraction_notes:'Handmatig ingevoerd; vergelijk de gegevens met het originele PDF-bestand.',
   project_numbers:[],project_lines:[],
   match_strength:'none',match_reason:'Handmatige koppeling: selecteer een bartender.'
  };
  const {error}=await admin.from('invoice_pdf_extractions').upsert(payload,{onConflict:'message_id,attachment_index'});
  if(error)return NextResponse.json({error:'Handmatig beoordelen kon niet worden gestart.'},{status:500});
  return NextResponse.json({ok:true,message:'Handmatige controle geopend. Bekijk de PDF en vul de factuurgegevens in.'});
 }
 if(action==='extract'){
  try{
   const result=await processInvoiceMessage(id,{force:true});
   return NextResponse.json({ok:true,message:result.failed?'Deze PDF kon niet automatisch worden herkend. Bekijk het foutbericht en vul de gegevens eventueel handmatig in.':
    result.processed?'PDF automatisch herkend. Controleer het origineel en bevestig de bartender.':'Deze PDF is al verwerkt.'});
  }catch(e){
   console.error('Manual invoice extraction failed',e instanceof Error?e.message:'unknown');
   return NextResponse.json({error:e instanceof Error?e.message:'PDF-verwerking mislukt. Controleer het bericht.'},{status:503});
  }
 }
 if(action==='link'){
  const extractionId=typeof body.extractionId==='string'?body.extractionId:'';
  const memberId=typeof body.memberId==='string'?body.memberId:'';
  const invoiceNumber=typeof body.invoiceNumber==='string'?body.invoiceNumber.trim():'';
  const invoiceDate=typeof body.invoiceDate==='string'?body.invoiceDate.trim():'';
  const amount=typeof body.totalAmount==='number'?body.totalAmount:Number(body.totalAmount);
  if(!UUID.test(extractionId)||!UUID.test(memberId)||!/^[A-Za-z0-9][A-Za-z0-9_/.-]{0,63}$/.test(invoiceNumber))
   return NextResponse.json({error:'Selecteer een crewlid en geef het factuurnummer op zoals het op de PDF staat (1–64 tekens).'}, {status:400});
  if(!Number.isFinite(amount)||amount<0||amount>99999999)return NextResponse.json({error:'Controleer het totaalbedrag.'},{status:400});
  if(invoiceDate&&(!/^20\d{2}-\d{2}-\d{2}$/.test(invoiceDate)||Number.isNaN(Date.parse(invoiceDate))))
   return NextResponse.json({error:'Controleer de factuurdatum.'},{status:400});
  const numberInput=Array.isArray(body.projectNumbers)?body.projectNumbers:[];
  const selectedNumbers=[...new Set(numberInput.map((x:unknown)=>String(x||'').trim()))];
  if(selectedNumbers.length>15||selectedNumbers.some(n=>!/^[0-9]{4,8}$/.test(n)))
   return NextResponse.json({error:'Controleer de projectnummers. Gebruik maximaal 15 echte Rentman-projectnummers.'},{status:400});
  type ProjectLineInput={project_number?:unknown;work_hours?:unknown;travel_hours?:unknown;expenses_amount?:unknown};
  const rawProjectLines=Array.isArray(body.projectLines)?body.projectLines as ProjectLineInput[]:[];
  if(rawProjectLines.length>15)return NextResponse.json({error:'Te veel projectregels.'},{status:400});
  const numeric=(value:unknown)=>{
   if(value===null||value===undefined||value==='')return null;
   const number=Number(value);
   return Number.isFinite(number)&&number>=0&&number<=100000?Math.round(number*100)/100:NaN;
  };
  const chosenLines=selectedNumbers.map(n=>{
   const line=rawProjectLines.find(x=>x.project_number===n);
   const worked=numeric(line?.work_hours),travel=numeric(line?.travel_hours),expenses=numeric(line?.expenses_amount);
   return {project_number:n,work_hours:worked,travel_hours:travel,expenses_amount:expenses,source:'manual',evidence:null};
  });
  if(chosenLines.some(line=>[line.work_hours,line.travel_hours,line.expenses_amount].some(v=>typeof v==='number'&&!Number.isFinite(v))))
   return NextResponse.json({error:'Controleer de opgegeven projecturen en onkosten.'},{status:400});
  const [{data:extraction},{data:member}]=await Promise.all([
   admin.from('invoice_pdf_extractions').select('id,message_id,storage_path,status,linked_invoice_id').eq('id',extractionId).eq('message_id',id).maybeSingle(),
   admin.from('crew_portal_members').select('id,portal_deleted').eq('id',memberId).maybeSingle()
  ]);
  if(!extraction||extraction.status==='linked'||extraction.linked_invoice_id)
   return NextResponse.json({error:'Deze bijlage is al gekoppeld of niet gevonden.'},{status:409});
  // An inactive Rentman planning status must not block accounting for historical or outstanding work.
  // A deleted portal crew profile is not available for new links.
  if(!member||member.portal_deleted)return NextResponse.json({error:'Dit crewprofiel bestaat niet meer of is verwijderd.'},{status:409});
  if(!extraction.storage_path.startsWith('incoming/'+id+'/'))
   return NextResponse.json({error:'Ongeldige bestandslocatie.'},{status:400});
  const {data:invoice,error:insertError}=await admin.from('crew_invoices').insert({
   crew_member_id:memberId,invoice_number:invoiceNumber,invoice_date:invoiceDate||null,
   total_amount:amount,status:'received',document_path:extraction.storage_path,
   project_numbers:selectedNumbers,project_lines:chosenLines
  }).select('id').single();
  if(insertError||!invoice){
   return NextResponse.json({error:'Koppelen mislukt. Controleer of deze PDF al gekoppeld is.'},{status:409});
  }
  const {error:updateError}=await admin.from('invoice_pdf_extractions')
   .update({status:'linked',linked_invoice_id:invoice.id,reviewed_at:new Date().toISOString(),
    project_numbers:selectedNumbers,project_lines:chosenLines})
   .eq('id',extractionId).neq('status','linked');
  if(updateError)console.error('PDF linked but extraction update failed',updateError.message);
  const {data:inbox}=await admin.from('invoice_inbox_messages').select('attachments').eq('id',id).maybeSingle();
  const {data:allExtractions}=await admin.from('invoice_pdf_extractions')
   .select('attachment_index,linked_invoice_id').eq('message_id',id);
  const expected=Array.isArray(inbox?.attachments)?inbox.attachments.length:0;
  const fullyLinked=expected>0&&Array.from({length:expected},(_,i)=>i).every(i=>
    (allExtractions||[]).some(e=>e.attachment_index===i&&e.linked_invoice_id));
  const patch=fullyLinked?{linked_invoice_id:invoice.id,archived_at:new Date().toISOString(),archive_reason:'linked'}:
    {linked_invoice_id:invoice.id};
  await admin.from('invoice_inbox_messages').update(patch).eq('id',id).is('linked_invoice_id',null);
  return NextResponse.json({ok:true,message:'Factuur gekoppeld. De shiftrapportvergelijking verschijnt in het controleoverzicht.'});
 }
 if(action==='archive'||action==='restore'){
   const {data:message}=await admin.from('invoice_inbox_messages').select('id,archived_at')
    .eq('id',id).maybeSingle();
   if(!message)return NextResponse.json({error:'E-mail niet gevonden.'},{status:404});
   if(action==='archive'){
    const reason=typeof body.reason==='string'?body.reason.trim():'';
    if(reason.length<5||reason.length>250)return NextResponse.json({error:'Geef een korte archiefreden op.'},{status:400});
    const {error}=await admin.from('invoice_inbox_messages').update({
     archived_at:new Date().toISOString(),archive_reason:reason
    }).eq('id',id);
    if(error)return NextResponse.json({error:'Archiveren is mislukt.'},{status:500});
    return NextResponse.json({ok:true,message:'E-mail naar het archief verplaatst. PDF blijft bewaard.'});
   }
   const {error}=await admin.from('invoice_inbox_messages')
    .update({archived_at:null,archive_reason:null,archived_by:null}).eq('id',id);
   if(error)return NextResponse.json({error:'Herstellen is mislukt.'},{status:500});
   return NextResponse.json({ok:true,message:'E-mail staat weer in de werkvoorraad.'});
 }
 return NextResponse.json({error:'Ongeldige actie.'},{status:400});
}
