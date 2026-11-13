
import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {allInvoiceAttachmentsReviewed} from '@/lib/invoice-attachment-status';

/** Archive an email only after every individual PDF has been handled. */
export async function archiveInvoiceEmailWhenReviewed(messageId:string){
 const db=createAdminClient();
 const [{data:message,error:msgError},{data:links,error:linkError},{data:reviews,error:reviewError}]=await Promise.all([
  db.from('invoice_inbox_messages').select('id,attachments,archived_at').eq('id',messageId).maybeSingle(),
  db.from('invoice_pdf_extractions').select('attachment_index,linked_invoice_id').eq('message_id',messageId),
  db.from('invoice_attachment_reviews').select('attachment_index').eq('message_id',messageId)
 ]);
 if(msgError||linkError||reviewError||!message)throw new Error('De bijlagen konden niet volledig worden gecontroleerd.');
 const count=Array.isArray(message.attachments)?message.attachments.length:0;
 const completed=allInvoiceAttachmentsReviewed(count,links||[],reviews||[]);
 if(completed&&!message.archived_at){
  const {error}=await db.from('invoice_inbox_messages').update({
   archived_at:new Date().toISOString(),
   archive_reason:(links||[]).filter(item=>item.linked_invoice_id).length===count?'linked':'all_attachments_reviewed'
  }).eq('id',messageId).is('archived_at',null);
  if(error)throw new Error('Automatisch archiveren is niet gelukt.');
 }
 return completed;
}
