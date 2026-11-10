import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {getInvoiceProcessingSettings} from '@/lib/invoice-processing-settings';
import {documentAiConfigured,parseGoogleInvoicePdf} from '@/lib/google-document-ai';
import {findCrewInvoiceMatch} from '@/lib/crew-invoice-matching';

type Attachment={path:string;filename:string;size:number};
export async function processInvoiceMessage(messageId:string){
 const settings=await getInvoiceProcessingSettings();
 if(!documentAiConfigured(settings))throw new Error('Google Document AI is nog niet geconfigureerd of getest. Ga naar Instellingen → Factuurverwerking.');
 const admin=createAdminClient();
 const {data:message,error:msgError}=await admin.from('invoice_inbox_messages').select('id,status,attachments')
  .eq('id',messageId).maybeSingle();
 if(msgError||!message)throw new Error('E-mail is niet gevonden.');
 const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as Attachment[];
 if(!attachments.length)return {processed:0,failed:0};
 const {data:members,error:membersError}=await admin.from('crew_portal_members')
  .select('id,full_name,email,rentman_email,login_email_override,invoice_email,company_name,company_alias').eq('active',true).eq('portal_deleted',false);
 if(membersError)throw new Error('Crewleden konden niet worden opgehaald.');
 let processed=0,failed=0;
 for(const [i,attachment] of attachments.slice(0,10).entries()){
  if(!attachment.path?.startsWith('incoming/'+messageId+'/')||!attachment.path.endsWith('.pdf'))continue;
  const {data:existing}=await admin.from('invoice_pdf_extractions').select('id,status')
   .eq('message_id',messageId).eq('attachment_index',i).maybeSingle();
  if(existing?.status==='linked')continue;
  const base={
   message_id:messageId,attachment_index:i,filename:String(attachment.filename||'Factuur.pdf').slice(0,180),
   storage_path:attachment.path,processing_provider:'google_document_ai',processed_at:new Date().toISOString()
  };
  try{
   if(!attachment.size||attachment.size>15*1024*1024)throw new Error('PDF is groter dan 15 MB.');
   const {data:blob,error:downloadError}=await admin.storage.from('incoming-invoices').download(attachment.path);
   if(downloadError||!blob)throw new Error('De PDF kon niet worden geladen.');
   const content=Buffer.from(await blob.arrayBuffer());
   const fields=await parseGoogleInvoicePdf(content,settings);
   const match=findCrewInvoiceMatch({
    supplierName:fields.supplier_name,supplierEmail:fields.supplier_email,
    detectedEmails:fields.detected_emails
   },members||[]);
   const notes=[
    !fields.invoice_number?'Geen betrouwbaar factuurnummer herkend.':null,
    !fields.invoice_date?'Controleer de factuurdatum.':null,
    fields.total_amount===null?'Geen betrouwbaar totaalbedrag herkend.':null,
    fields.ai_confidence!==null&&fields.ai_confidence<0.8?'Google AI geeft een lage herkenningszekerheid aan.':null,
    match.strength!=='strong'?match.reason:null
   ].filter(Boolean).join(' ');
   const {error}=await admin.from('invoice_pdf_extractions').upsert({
    ...base,invoice_number:fields.invoice_number,invoice_date:fields.invoice_date,
    total_amount:fields.total_amount,supplier_name:fields.supplier_name,
    detected_emails:fields.detected_emails,ai_fields:fields.ai_fields,
    ai_confidence:fields.ai_confidence,text_preview:fields.raw_text.slice(0,12000),
    status:notes?'needs_review':'extracted',suggested_crew_member_id:match.suggestedCrewMemberId,
    match_strength:match.strength,match_reason:match.reason,extraction_notes:notes||null
   },{onConflict:'message_id,attachment_index'});
   if(error)throw new Error('Herkenningsresultaat kon niet worden opgeslagen.');
   processed++;
  }catch(error){
   const reason=error instanceof Error?error.message:'Onbekende verwerkingsfout';
   console.error('Google Document AI invoice extraction failed',reason.slice(0,240));
   const {error:recordError}=await admin.from('invoice_pdf_extractions').upsert({
    ...base,status:'failed',extraction_notes:reason.slice(0,350)
   },{onConflict:'message_id,attachment_index'});
   if(recordError)console.error('Invoice extraction failure could not be saved',recordError.message);
   failed++;
  }
 }
 return {processed,failed};
}
export async function processPendingInvoicePdfs(limit=2){
 const settings=await getInvoiceProcessingSettings();
 if(!documentAiConfigured(settings))return 0; // Never invoke Google before setup and explicit successful test.
 const admin=createAdminClient();
 const {data:messages,error}=await admin.from('invoice_inbox_messages')
  .select('id').eq('status','received').order('received_by_portal_at',{ascending:true}).limit(60);
 if(error)throw error;
 let count=0;
 for(const message of messages||[]){
  if(count>=limit)break;
  const {data:existing,error:existingError}=await admin.from('invoice_pdf_extractions')
   .select('id').eq('message_id',message.id).limit(1);
  if(existingError)throw existingError;
  if(existing?.length)continue;
  await processInvoiceMessage(message.id);
  count++;
 }
 return count;
}
