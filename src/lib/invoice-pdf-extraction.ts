import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {getInvoiceProcessingSettings} from '@/lib/invoice-processing-settings';
import {documentAiConfigured,parseGoogleInvoicePdf,type ParsedGoogleInvoice} from '@/lib/google-document-ai';
import {readInvoicePdfText,recognizeInvoiceText} from '@/lib/local-invoice-reader';
import {findCrewInvoiceMatch} from '@/lib/crew-invoice-matching';

type Attachment={path:string;filename:string;size:number};
type RecognitionOptions={force?:boolean};
async function recognize(content:Buffer,filename:string):Promise<{fields:ParsedGoogleInvoice;provider:string;fallbackNotice:string|null}>{
 const settings=await getInvoiceProcessingSettings();
 let googleError:string|null=null;
 if(documentAiConfigured(settings)){
  try{
   const fields=await parseGoogleInvoicePdf(content,settings);
   if(fields.invoice_number||fields.invoice_date||fields.total_amount!==null)
    return {fields,provider:'google_document_ai',fallbackNotice:null};
   googleError='Google Document AI herkende onvoldoende gegevens.';
  }catch(error){
   googleError=error instanceof Error?error.message:'Google Document AI kon deze PDF niet verwerken.';
   console.error('Google Invoice Parser failed; local fallback attempted',googleError.slice(0,200));
  }
 }
 try{
  const text=await readInvoicePdfText(content);
  const fields=recognizeInvoiceText(text,filename);
  return {
   fields,provider:'pdf_text',
   fallbackNotice:googleError?'Google AI kon deze factuur niet uitlezen; de portal heeft een basisherkenning uitgevoerd.':null
  };
 }catch(error){
  if(googleError)throw new Error('Google AI en de lokale herkenning zijn niet gelukt. Controleer de PDF en vul handmatig in.');
  throw error;
 }
}
export async function processInvoiceMessage(messageId:string,options:RecognitionOptions={}){
 const admin=createAdminClient();
 const {data:message,error:msgError}=await admin.from('invoice_inbox_messages')
  .select('id,status,attachments').eq('id',messageId).maybeSingle();
 if(msgError||!message)throw new Error('E-mail is niet gevonden.');
 const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as Attachment[];
 if(!attachments.length)return {processed:0,failed:0,skipped:0};
 const {data:members,error:membersError}=await admin.from('crew_portal_members')
  .select('id,full_name,email,rentman_email,login_email_override,invoice_email,company_name,company_alias')
  .eq('portal_deleted',false);
 if(membersError)throw new Error('Crewleden konden niet worden opgehaald.');
 let processed=0,failed=0,skipped=0;
 for(const [i,attachment] of attachments.slice(0,10).entries()){
  if(!attachment.path?.startsWith('incoming/'+messageId+'/')||!attachment.path.endsWith('.pdf'))continue;
  const {data:existing,error:lookupError}=await admin.from('invoice_pdf_extractions')
   .select('id,status,linked_invoice_id').eq('message_id',messageId).eq('attachment_index',i).maybeSingle();
  if(lookupError)throw new Error('Factuurverwerking kon niet worden gecontroleerd.');
  // Never touch a linked invoice; automatically importing mail must not overwrite hand-reviewed data.
  if(existing?.status==='linked'||existing?.linked_invoice_id||existing&&!options.force){skipped++;continue;}
  const base={
   message_id:messageId,attachment_index:i,
   filename:String(attachment.filename||'Factuur.pdf').slice(0,180),
   storage_path:attachment.path,processed_at:new Date().toISOString()
  };
  try{
   if(!attachment.size||attachment.size>15*1024*1024)throw new Error('De PDF is groter dan 15 MB of leeg.');
   const {data:blob,error:downloadError}=await admin.storage.from('incoming-invoices').download(attachment.path);
   if(downloadError||!blob)throw new Error('De PDF kon niet veilig worden geladen.');
   const content=Buffer.from(await blob.arrayBuffer());
   const {fields,provider,fallbackNotice}=await recognize(content,base.filename);
   const match=findCrewInvoiceMatch({
    supplierName:fields.supplier_name,supplierEmail:fields.supplier_email,
    detectedEmails:fields.detected_emails,documentText:fields.raw_text
   },members||[]);
   const notes=[
    fallbackNotice,
    !fields.invoice_number?'Factuurnummer niet betrouwbaar herkend.':null,
    !fields.invoice_date?'Factuurdatum controleren of invullen.':null,
    fields.total_amount===null?'Totaalbedrag controleren of invullen.':null,
    provider==='google_document_ai'&&fields.ai_confidence!==null&&fields.ai_confidence<0.8?
     'Google AI geeft een lage herkenningszekerheid aan.':null,
    provider==='pdf_text'?'Basisherkenning uit PDF-tekst; controleer het origineel.':null,
    match.strength!=='strong'?match.reason:null
   ].filter(Boolean).join(' ');
   const {error}=await admin.from('invoice_pdf_extractions').upsert({
    ...base,processing_provider:provider,
    invoice_number:fields.invoice_number,invoice_date:fields.invoice_date,
    total_amount:fields.total_amount,supplier_name:fields.supplier_name,
    detected_emails:fields.detected_emails,ai_fields:fields.ai_fields,
    ai_confidence:provider==='google_document_ai'?fields.ai_confidence:null,
    text_preview:fields.raw_text.slice(0,12000),
    status:notes?'needs_review':'extracted',
    suggested_crew_member_id:match.suggestedCrewMemberId,
    match_strength:match.strength,match_reason:match.reason,
    extraction_notes:notes||null
   },{onConflict:'message_id,attachment_index'});
   if(error)throw new Error('Het herkenningsresultaat kon niet worden opgeslagen.');
   processed++;
  }catch(error){
   const reason=error instanceof Error?error.message:'Onbekende verwerkingsfout';
   console.error('Invoice PDF recognition failed',reason.slice(0,230));
   const {error:recordError}=await admin.from('invoice_pdf_extractions').upsert({
    ...base,processing_provider:'pdf_text',status:'failed',
    extraction_notes:reason.slice(0,350)
   },{onConflict:'message_id,attachment_index'});
   if(recordError)console.error('Invoice extraction failure could not be stored',recordError.message);
   failed++;
  }
 }
 return {processed,failed,skipped};
}
export async function processPendingInvoicePdfs(limit=2){
 const admin=createAdminClient();
 const {data:messages,error}=await admin.from('invoice_inbox_messages')
  .select('id,attachments').eq('status','received')
  .order('received_by_portal_at',{ascending:true}).limit(75);
 if(error)throw new Error('De inbox kon niet worden opgehaald voor automatische verwerking.');
 let done=0;
 for(const message of messages||[]){
  if(done>=limit)break;
  const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as Attachment[];
  if(!attachments.length)continue;
  const {data:extractions,error:lookupError}=await admin.from('invoice_pdf_extractions')
   .select('attachment_index').eq('message_id',message.id);
  if(lookupError)throw new Error('Automatisch herkennen kon niet controleren welke PDF’s al zijn verwerkt.');
  const processedIndexes=new Set((extractions||[]).map(e=>e.attachment_index));
  const missing=attachments.slice(0,10).some((file,index)=>file.path?.endsWith('.pdf')&&!processedIndexes.has(index));
  if(!missing)continue;
  await processInvoiceMessage(message.id);
  done++;
 }
 return done;
}
