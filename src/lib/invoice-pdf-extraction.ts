import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {readInvoicePdfText,recognizeInvoiceText} from '@/lib/local-invoice-reader';
import {recognizeCrewInvoiceProjects} from '@/lib/invoice-project-directory';
import {findCrewInvoiceMatch} from '@/lib/crew-invoice-matching';

type Attachment={path:string;filename:string;size:number};
type RecognitionOptions={force?:boolean};

/**
 * SHAKENSTYLE recognition: locally extracted PDF text; no Google service or external AI.
 * Every result needs staff review. Historical linked invoices cannot be overwritten.
 */
export async function processInvoiceMessage(messageId:string,options:RecognitionOptions={}){
 const admin=createAdminClient();
 const {data:message,error:msgError}=await admin.from('invoice_inbox_messages')
  .select('id,status,attachments').eq('id',messageId).maybeSingle();
 if(msgError||!message)throw new Error('E-mail niet gevonden.');
 const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as Attachment[];
 if(!attachments.length)return {processed:0,failed:0,skipped:0};
 const {data:members,error:membersError}=await admin.from('crew_portal_members')
  .select('id,full_name,email,rentman_email,login_email_override,invoice_email,company_name,company_alias').eq('portal_deleted',false);
 if(membersError)throw new Error('Crewleden konden niet worden geladen.');
 let processed=0,failed=0,skipped=0;
 for(const [i,attachment] of attachments.slice(0,10).entries()){
  if(!attachment.path?.startsWith('incoming/'+messageId+'/')||!attachment.path.endsWith('.pdf'))continue;
  const {data:existing,error:lookupError}=await admin.from('invoice_pdf_extractions')
   .select('id,status,linked_invoice_id').eq('message_id',messageId).eq('attachment_index',i).maybeSingle();
  if(lookupError)throw new Error('Factuurverwerking kon niet worden gecontroleerd.');
  if(existing?.status==='linked'||existing?.linked_invoice_id||existing&&!options.force){skipped++;continue;}
  const base={
   message_id:messageId,attachment_index:i,
   filename:String(attachment.filename||'Factuur.pdf').slice(0,180),
   storage_path:attachment.path,processed_at:new Date().toISOString()
  };
  try{
   if(!attachment.size||attachment.size>15*1024*1024)throw new Error('PDF is leeg of groter dan 15 MB.');
   const {data:blob,error:downloadError}=await admin.storage.from('incoming-invoices').download(attachment.path);
   if(downloadError||!blob)throw new Error('PDF kon niet worden geladen.');
   const text=await readInvoicePdfText(Buffer.from(await blob.arrayBuffer()));
   const fields=recognizeInvoiceText(text,base.filename);
   const projects=await recognizeCrewInvoiceProjects(text,base.filename);
   const match=findCrewInvoiceMatch({
    supplierName:fields.supplier_name,supplierEmail:fields.supplier_email,
    detectedEmails:fields.detected_emails,documentText:fields.raw_text
   },members||[]);
   const notes=[
    !fields.invoice_number?'Factuurnummer niet gevonden.':null,
    !fields.invoice_date?'Factuurdatum controleren.':null,
    fields.total_amount===null?'Totaalbedrag controleren.':null,
    ...projects.notes,
    'SHAKENSTYLE PDF-herkenning; controleer de velden met het origineel.',
    match.strength!=='strong'?match.reason:null
   ].filter(Boolean).join(' ');
   const {error}=await admin.from('invoice_pdf_extractions').upsert({
    ...base,processing_provider:'pdf_text',
    invoice_number:fields.invoice_number,invoice_date:fields.invoice_date,
    total_amount:fields.total_amount,supplier_name:fields.supplier_name,
    detected_emails:fields.detected_emails,ai_fields:fields.ai_fields,
    ai_confidence:null,text_preview:text.slice(0,12000),
    project_numbers:projects.numbers,project_lines:projects.lines,
    status:'needs_review',suggested_crew_member_id:match.suggestedCrewMemberId,
    match_strength:match.strength,match_reason:match.reason,extraction_notes:notes
   },{onConflict:'message_id,attachment_index'});
   if(error)throw new Error('Herkenningsresultaat kon niet worden opgeslagen: '+error.message);
   processed++;
  }catch(error){
   const reason=error instanceof Error?error.message:'Onbekende verwerkingsfout';
   console.error('SHAKENSTYLE invoice extraction failed',reason.slice(0,230));
   const {error:recordError}=await admin.from('invoice_pdf_extractions').upsert({
    ...base,processing_provider:'pdf_text',status:'failed',
    extraction_notes:reason.slice(0,350)
   },{onConflict:'message_id,attachment_index'});
   if(recordError)console.error('Invoice failure could not be saved',recordError.message);
   failed++;
  }
 }
 return {processed,failed,skipped};
}
export async function processPendingInvoicePdfs(limit=2){
 const admin=createAdminClient();
 const {data:messages,error}=await admin.from('invoice_inbox_messages')
  .select('id,attachments').eq('status','received').is('archived_at',null)
  .order('received_by_portal_at',{ascending:true}).limit(75);
 if(error)throw new Error('De inkomende mailbox kon niet worden gelezen.');
 let done=0;
 for(const message of messages||[]){
  if(done>=limit)break;
  const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as Attachment[];
  if(!attachments.length)continue;
  const {data:extractions,error:lookupError}=await admin.from('invoice_pdf_extractions')
   .select('attachment_index').eq('message_id',message.id);
  if(lookupError)throw new Error('PDF-controle is niet beschikbaar.');
  const indexes=new Set((extractions||[]).map(e=>e.attachment_index));
  const missing=attachments.slice(0,10).some((a,i)=>a.path?.endsWith('.pdf')&&!indexes.has(i));
  if(!missing)continue;
  await processInvoiceMessage(message.id);
  done++;
 }
 return done;
}
