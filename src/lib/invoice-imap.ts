import 'server-only';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {ImapFlow} from 'imapflow';
import {createAdminClient} from '@/lib/supabase/admin';

export type ImapRow={
 id:number;host:string;port:number;username:string;password_encrypted:string|null;
 enabled:boolean;tested_at:string|null;last_sync_at:string|null;
 last_sync_result:string|null;last_error:string|null;last_uid:number;
 last_uid_validity:string|null;sync_lock_until:string|null;updated_at:string;
};
export function validImapParams(host:string,port:number,username:string){
 // Only the organization's known mail provider is allowed: avoids SSRF through TCP destinations.
 return host.toLowerCase()==='mail.antagonist.nl'&&port===993&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)&&username.length<=254;
}
function key(){
 const hex=process.env.INVOICE_MAIL_ENCRYPTION_KEY;
 if(!hex||!/^[0-9a-f]{64}$/i.test(hex))throw Error('IMAP versleuteling is niet geconfigureerd.');
 return Buffer.from(hex,'hex');
}
export function encryptSecret(value:string){
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key(),nonce);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return [nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function decryptSecret(value:string){
 const pieces=value.split('.');
 if(pieces.length!==3)throw Error('IMAP wachtwoord heeft een ongeldige opslagindeling.');
 const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(pieces[0],'base64url'));
 decipher.setAuthTag(Buffer.from(pieces[1],'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(pieces[2],'base64url')),decipher.final()]).toString('utf8');
}
export async function getImapRow():Promise<ImapRow>{
 const admin=createAdminClient();
 const {data,error}=await admin.from('invoice_imap_settings').select('*').eq('id',1).single();
 if(error||!data)throw Error('IMAP-instellingen niet beschikbaar.');
 return data as ImapRow;
}
export function createImapClient(row:ImapRow){
 if(!validImapParams(row.host,row.port,row.username)||!row.password_encrypted)throw Error('IMAP-gegevens zijn onvolledig.');
 return new ImapFlow({
  host:row.host,port:row.port,secure:true,
  auth:{user:row.username,pass:decryptSecret(row.password_encrypted)},
  tls:{rejectUnauthorized:true},connectionTimeout:12000,greetingTimeout:10000,
  socketTimeout:30000,logger:false
 });
}
export async function checkImapConnection(row:ImapRow){
 const client=createImapClient(row);
 try{
  await client.connect();
  const mailbox=await client.mailboxOpen('INBOX',{readOnly:true});
  return {exists:mailbox.exists||0};
 }finally{await client.logout().catch(()=>undefined);}
}
export function safeImapStatus(row:Pick<ImapRow,'host'|'port'|'username'|'password_encrypted'|'enabled'|'tested_at'|'last_sync_at'|'last_sync_result'|'last_error'>){
 return {
  host:row.host,port:row.port,username:row.username,hasPassword:Boolean(row.password_encrypted),
  enabled:row.enabled,testedAt:row.tested_at,lastSyncAt:row.last_sync_at,
  lastSyncResult:row.last_sync_result,lastError:row.last_error
 };
}
