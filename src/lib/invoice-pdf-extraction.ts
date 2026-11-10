import 'server-only';
import {PDFParse} from 'pdf-parse';
import {createAdminClient} from '@/lib/supabase/admin';

function normalizeMoney(raw:string){
 const value=raw.replace(/[^\d,.]/g,'');
 if(!value)return null;
 const comma=value.lastIndexOf(','),dot=value.lastIndexOf('.');
 const decimalSep=comma>dot?',':'.';
 const precision=value.slice(Math.max(comma,dot)+1);
 let normalized=value;
 if(Math.max(comma,dot)>=0 && precision.length===2){
  const other=decimalSep===','?'.':',';
  normalized=value.replaceAll(other,'').replace(decimalSep,'.');
 }else normalized=value.replace(/[,.]/g,'');
 const amount=Number(normalized);
 return Number.isFinite(amount)&&amount>=0&&amount<100000000?amount:null;
}
function dateValue(value:string){
 const match=value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d)$/);
 if(!match)return null;
 const d=Number(match[1]),m=Number(match[2]),y=Number(match[3]);
 const parsed=new Date(Date.UTC(y,m-1,d));
 return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d?y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null;
}
export function extractInvoiceFields(text:string){
 const lines=text.split(/[\r\n]+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,300);
 const invoiceMatch=lines.map(line=>line.match(/\b(?:factuurnummer|factuur\s*(?:nr\.?|nummer|no\.?)|invoice\s*(?:number|no\.?|#)|invoice\s*#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_\/-]{3,32})\b/i)).find(Boolean);
 const number=invoiceMatch?.[1]?.replace(/[.,;:]$/,'')||null;
 const dateMatch=lines.map(line=>line.match(/\b(?:factuurdatum|invoice\s*date|datum|date)\s*[:#-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]20\d\d)\b/i)).find(Boolean);
 const date=dateMatch?dateValue(dateMatch[1]):null;
 const priority=lines.filter(line=>/(?:totaal\s*(?:te\s*betalen|incl\.?\s*btw|inclusief\s*btw|bedrag)|total\s*(?:due|incl|amount)|amount\s*due|te\s*betalen)/i.test(line));
 let total:null|number=null;
 for(const line of priority.slice(-12).reverse()){
  const matches=[...line.matchAll(/(?:€|EUR)\s*([\d.,]+)|([\d.,]+)\s*(?:€|EUR)/gi)];
  if(matches.length){total=normalizeMoney((matches.at(-1)?.[1]||matches.at(-1)?.[2])??'');if(total!==null)break;}
 }
 const candidates=[...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase()))].slice(0,25);
 const supplier=lines.slice(0,8).find(x=>x.length>3&&x.length<100&&!/^(factuur|invoice|datum|date|btw|vat|pagina|page|tel|email|e-mail)\b/i.test(x))||null;
 return {invoice_number:number,invoice_date:date,total_amount:total,supplier_name:supplier,detected_emails:candidates};
}
export async function processInvoiceMessage(messageId:string){
 const admin=createAdminClient();
 const {data:message,error:msgError}=await admin.from('invoice_inbox_messages').select('id,status,attachments').eq('id',messageId).maybeSingle();
 if(msgError||!message)throw Error('E-mail niet gevonden.');
 const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as {path:string;filename:string;size:number}[];
 const results:string[]=[];
 if(!attachments.length)return {processed:0,failed:0};
 const {data:members,error:membersError}=await admin.from('crew_portal_members').select('id,full_name,email,rentman_email,login_email_override').eq('active',true);
 if(membersError)throw Error('Crewleden konden niet worden opgehaald.');
 let processed=0,failed=0;
 for(const [i,attachment] of attachments.slice(0,10).entries()){
  if(!attachment.path?.startsWith('incoming/'+messageId+'/')||!attachment.path.endsWith('.pdf'))continue;
  const {data:existing}=await admin.from('invoice_pdf_extractions').select('id,status').eq('message_id',messageId).eq('attachment_index',i).maybeSingle();
  if(existing&&existing.status==='linked')continue;
  try{
   if(!attachment.size||attachment.size>15*1024*1024)throw Error('PDF groter dan 15 MB.');
   const {data:blob,error:downloadError}=await admin.storage.from('incoming-invoices').download(attachment.path);
   if(downloadError||!blob)throw Error('PDF-download mislukt.');
   const content=Buffer.from(await blob.arrayBuffer());
   if(content.length>15*1024*1024||content.subarray(0,5).toString()!=='%PDF-')throw Error('Geen geldige PDF.');
   const parser=new PDFParse({data:new Uint8Array(content)});
   let extractedText='';
   try{const parsed=await parser.getText();extractedText=String(parsed.text||'').slice(0,40000);}
   finally{await parser.destroy();}
   const fields=extractInvoiceFields(extractedText);
   const matchingMembers=(members||[]).filter(m=>[m.email,m.rentman_email,m.login_email_override].some(email=>email&&fields.detected_emails.includes(String(email).trim().toLowerCase())));
   const proposed=matchingMembers.length===1?matchingMembers[0].id:null;
   const notes=[
    !extractedText.trim()?'PDF bevat geen selecteerbare tekst; handmatig beoordelen.':null,
    !fields.invoice_number?'Factuurnummer niet betrouwbaar herkend.':null,
    fields.total_amount===null?'Totaalbedrag niet betrouwbaar herkend.':null,
    matchingMembers.length>1?'Meer dan één crew-account matcht; handmatig kiezen.':null,
    !proposed?'Crewlid niet automatisch herkend; handmatig kiezen of als leverancier behandelen.':null
   ].filter(Boolean).join(' ');
   const {error}=await admin.from('invoice_pdf_extractions').upsert({
    message_id:messageId,attachment_index:i,filename:attachment.filename||'Factuur.pdf',storage_path:attachment.path,
    status:notes?'needs_review':'extracted',text_preview:extractedText.slice(0,12000),
    ...fields,suggested_crew_member_id:proposed,extraction_notes:notes||null,
    processed_at:new Date().toISOString()
   },{onConflict:'message_id,attachment_index'});
   if(error)throw error;
   results.push('ok');processed++;
  }catch(error){
   const message=error instanceof Error?error.message:'PDF kan niet worden uitgelezen.';
   console.error('Invoice PDF extraction failed',message);
   await admin.from('invoice_pdf_extractions').upsert({
    message_id:messageId,attachment_index:i,filename:attachment.filename||'Factuur.pdf',
    storage_path:attachment.path,status:'failed',extraction_notes:'PDF automatisch uitlezen mislukt; handmatig controleren.',
    processed_at:new Date().toISOString()
   },{onConflict:'message_id,attachment_index'});
   results.push('failed');failed++;
  }
 }
 return {processed,failed};
}
export async function processPendingInvoicePdfs(limit=2){
 const admin=createAdminClient();
 const {data:messages,error}=await admin.from('invoice_inbox_messages').select('id').eq('status','received').order('received_by_portal_at',{ascending:true}).limit(60);
 if(error)throw error;
 let count=0;
 for(const msg of messages||[]){
  if(count>=limit)break;
  const {data:existing}=await admin.from('invoice_pdf_extractions').select('id').eq('message_id',msg.id).limit(1);
  if(existing?.length)continue;
  await processInvoiceMessage(msg.id);count++;
 }
 return count;
}
