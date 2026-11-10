import 'server-only';
import {simpleParser} from 'mailparser';
import {createAdminClient} from '@/lib/supabase/admin';
import {createImapClient,getImapRow} from '@/lib/invoice-imap';

export const MAX_MESSAGE_BYTES=18*1024*1024;
const MAX_MESSAGES_PER_RUN=20;
type SyncResult={ok:boolean;message:string;imported?:number;skipped?:number};
export async function synchronizeInvoiceInbox({manual=false}:{manual?:boolean}={}):Promise<SyncResult>{
 const admin=createAdminClient();
 const row=await getImapRow();
 if(!manual&&!row.enabled)return {ok:true,message:'Automatisch ophalen is uitgeschakeld.'};
 if(!row.tested_at||!row.password_encrypted)return {ok:false,message:'Test eerst de IMAP-verbinding en sla het wachtwoord op.'};
 const now=new Date().toISOString();
 const lockUntil=new Date(Date.now()+110000).toISOString();
 const {data:locked,error:lockError}=await admin.from('invoice_imap_settings').update({sync_lock_until:lockUntil})
   .eq('id',1).or('sync_lock_until.is.null,sync_lock_until.lt.'+now)
   .select('id').maybeSingle();
 if(lockError)return {ok:false,message:'Vergrendeling van de synchronisatie is mislukt.'};
 if(!locked)return {ok:false,message:'Er is al een synchronisatie bezig.'};
 const client=createImapClient(row);
 let imported=0,skipped=0,processed=0,cursor=Number(row.last_uid||0);
 let uidValidity=String(row.last_uid_validity||'');
 try{
  await client.connect();
  const mailbox=await client.mailboxOpen('INBOX',{readOnly:true});
  const validity=String(mailbox.uidValidity||'unknown');
  const mailboxKey=row.username.trim().toLowerCase();
  const changed=uidValidity!==validity;
  if(changed){uidValidity=validity;cursor=0;}
  // Initial import is bounded; subsequent runs continue from the last recorded UID.
  const firstUid=cursor>0?cursor+1:Math.max(1,Number(mailbox.uidNext||1)-101);
  if(Number(mailbox.exists||0)>0){
   for await(const item of client.fetch(firstUid+':*',{uid:true,size:true,source:true,internalDate:true,envelope:true},{uid:true})){
    const uid=Number(item.uid);
    if(!Number.isSafeInteger(uid)||uid<=cursor)continue;
    if(processed>=MAX_MESSAGES_PER_RUN)break;
    processed++;
    const {data:existing,error:lookupError}=await admin.from('invoice_inbox_messages')
      .select('id').eq('mailbox_key',mailboxKey).eq('uid_validity',validity).eq('imap_uid',uid).maybeSingle();
    if(lookupError)throw lookupError;
    if(existing){cursor=uid;skipped++;continue;}
    const messageId=crypto.randomUUID();
    const pathPrefix='incoming/'+messageId;
    const source=item.source;
    const sourceSize=Number(item.size||0);
    const oversized=sourceSize>MAX_MESSAGE_BYTES||Boolean(source&&source.length>MAX_MESSAGE_BYTES);
    const sender=String(item.envelope?.from?.[0]?.address||'').slice(0,320)||null;
    const subject=String(item.envelope?.subject||'').slice(0,600)||null;
    let status:'received'|'no_pdf'|'too_large'|'processing_error'='received';
    let errorMessage:string|null=null;
    let originalPath:string|null=null;
    const attachments:{filename:string;path:string;size:number}[]=[];
    if(oversized){status='too_large';errorMessage='E-mail is groter dan de limiet van 18 MB.';}
    else if(!source){status='processing_error';errorMessage='De e-mail kon niet worden gedownload.';}
    else{
     const stored=await admin.storage.from('incoming-invoices').upload(pathPrefix+'/original.eml',source,{contentType:'message/rfc822',upsert:false});
     if(stored.error){status='processing_error';errorMessage='Origineel opslaan mislukt.';}
     else{
      originalPath=pathPrefix+'/original.eml';
      try{
       const parsed=await simpleParser(source,{skipHtmlToText:true,maxHtmlLengthToParse:100000});
       const pdfs=parsed.attachments.filter(a=>{
        const head=a.content.subarray(0,5).toString('ascii');
        return head==='%PDF-'&&a.content.length<=15*1024*1024;
       }).slice(0,10);
       if(!pdfs.length)status='no_pdf';
       for(let i=0;i<pdfs.length;i++){
        const pdf=pdfs[i];
        const filePath=pathPrefix+'/invoice-'+String(i+1)+'.pdf';
        const result=await admin.storage.from('incoming-invoices').upload(filePath,pdf.content,{contentType:'application/pdf',upsert:false});
        if(result.error){status='processing_error';errorMessage='Een PDF-bijlage kon niet worden opgeslagen.';break;}
        attachments.push({filename:String(pdf.filename||'Factuur.pdf').slice(0,180),path:filePath,size:pdf.content.length});
       }
      }catch(e){console.error('IMAP e-mail parsing failed',e instanceof Error?e.message:'unknown');status='processing_error';errorMessage='De e-mail kon niet worden uitgelezen.';}
     }
    }
    const {error:saveError}=await admin.from('invoice_inbox_messages').insert({
     id:messageId,mailbox_key:mailboxKey,uid_validity:validity,imap_uid:uid,
     sender,subject,received_at:item.internalDate?.toISOString()||null,
     status,attachments,original_path:originalPath,error_message:errorMessage
    });
    if(saveError)throw saveError;
    if(status==='received')imported++;else skipped++;
    cursor=uid;
    const {error:cursorError}=await admin.from('invoice_imap_settings').update({last_uid:cursor,last_uid_validity:uidValidity}).eq('id',1);
    if(cursorError)throw cursorError;
   }
  }
  const resultText='Laatste controle voltooid: '+imported+' nieuwe e-mails met PDF, '+skipped+' zonder bruikbare PDF of al verwerkt.';
  const {error:updateError}=await admin.from('invoice_imap_settings').update({
   last_uid:cursor,last_uid_validity:uidValidity,
   last_sync_at:new Date().toISOString(),last_sync_result:resultText,last_error:null
  }).eq('id',1);
  if(updateError)throw updateError;
  return {ok:true,message:resultText,imported,skipped};
 }catch(e){
  console.error('Invoice IMAP sync failed',e instanceof Error?e.message:'unknown');
  const errorText='IMAP-synchronisatie mislukt. Controleer de verbinding of vraag beheer de serverlogs te bekijken.';
  await admin.from('invoice_imap_settings').update({last_error:errorText,last_sync_result:null}).eq('id',1);
  return {ok:false,message:errorText};
 }finally{
  if(client.usable)await client.logout().catch(()=>undefined);
  await admin.from('invoice_imap_settings').update({sync_lock_until:null}).eq('id',1).eq('sync_lock_until',lockUntil);
 }
}
