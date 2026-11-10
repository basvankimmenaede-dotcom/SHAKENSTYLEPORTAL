import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {checkImapConnection,encryptSecret,getImapRow,safeImapStatus,validImapParams} from '@/lib/invoice-imap';

export const runtime='nodejs';
export const maxDuration=30;
function sameOrigin(request:NextRequest){
 const origin=request.headers.get('origin');
 const host=request.headers.get('host');
 return Boolean(origin && host && new URL(origin).host===host && new URL(origin).protocol==='https:');
}
async function isAdmin(){
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return null;
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 return profile?.role==='admin'?user:null;
}
export async function POST(request:NextRequest){
 const user=await isAdmin();
 if(!user)return NextResponse.json({error:'Alleen beheerders kunnen IMAP wijzigen.'},{status:403});
 if(!sameOrigin(request))return NextResponse.json({error:'Onjuiste herkomst van verzoek.'},{status:403});
 const payload=await request.json().catch(()=>null);
 const action=payload?.action;
 if(!['save','test','toggle','sync'].includes(action))return NextResponse.json({error:'Ongeldige actie.'},{status:400});
 const admin=createAdminClient();
 let row;
 try{row=await getImapRow();}catch{return NextResponse.json({error:'IMAP-instellingen niet gevonden.'},{status:503})}

 if(action==='save'){
  const host=String(payload.host||'').trim().toLowerCase();
  const port=Number(payload.port);
  const username=String(payload.username||'').trim().toLowerCase();
  const password=typeof payload.password==='string'?payload.password:'';
  if(!validImapParams(host,port,username))return NextResponse.json({error:'Gebruik mail.antagonist.nl, poort 993 en een geldig volledig e-mailadres.'},{status:400});
  if(password.length>256)return NextResponse.json({error:'Het wachtwoord is te lang.'},{status:400});
  const changed=host!==row.host||port!==row.port||username!==row.username||Boolean(password);
  let secret=row.password_encrypted;
  if(password)try{secret=encryptSecret(password)}catch{return NextResponse.json({error:'De wachtwoordversleuteling is niet beschikbaar.'},{status:503})}
  const {error}=await admin.from('invoice_imap_settings').update({
   host,port,username,password_encrypted:secret,enabled:changed?false:row.enabled,
   tested_at:changed?null:row.tested_at,
   last_uid:username!==row.username?0:row.last_uid,
   last_uid_validity:username!==row.username?null:row.last_uid_validity,
   last_error:null,updated_at:new Date().toISOString(),updated_by:user.id
  }).eq('id',1);
  if(error)return NextResponse.json({error:'Opslaan is mislukt.'},{status:500});
  return NextResponse.json({ok:true,message:changed?'IMAP opgeslagen. Test de verbinding om verwerking in te schakelen.':'IMAP-instellingen opgeslagen.',status:safeImapStatus(await getImapRow())});
 }
 if(action==='test'){
  if(!row.password_encrypted)return NextResponse.json({error:'Sla eerst een wachtwoord op.'},{status:400});
  try{
   const response=await checkImapConnection(row);
   const {error}=await admin.from('invoice_imap_settings').update({tested_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',1);
   if(error)throw Error('Opslaan verbindingsstatus mislukt.');
   return NextResponse.json({ok:true,message:'Verbinding geslaagd. Inbox bereikbaar ('+response.exists+' berichten).',status:safeImapStatus(await getImapRow())});
  }catch(error){
   console.error('Invoice IMAP connection test failed',error instanceof Error?error.message:'unknown');
   await admin.from('invoice_imap_settings').update({enabled:false,tested_at:null,last_error:'Verbinding mislukt. Controleer gebruikersnaam, wachtwoord en IMAP-toegang.',updated_at:new Date().toISOString()}).eq('id',1);
   return NextResponse.json({error:'Verbinding mislukt. Controleer je IMAP-gegevens en probeer opnieuw.'},{status:502});
  }
 }
 if(action==='toggle'){
  if(typeof payload.enabled!=='boolean')return NextResponse.json({error:'Kies aan of uit.'},{status:400});
  if(payload.enabled&&(!row.tested_at||!row.password_encrypted))return NextResponse.json({error:'Test eerst de verbinding met de opgeslagen gegevens.'},{status:409});
  const {error}=await admin.from('invoice_imap_settings').update({enabled:payload.enabled,updated_at:new Date().toISOString(),updated_by:user.id}).eq('id',1);
  if(error)return NextResponse.json({error:'Inschakelen is mislukt.'},{status:500});
  return NextResponse.json({ok:true,message:payload.enabled?'Automatische verwerking ingeschakeld.':'Automatische verwerking uitgeschakeld.',status:safeImapStatus(await getImapRow())});
 }
 if(!row.tested_at)return NextResponse.json({error:'Test eerst de IMAP-verbinding.'},{status:409});
 try{
  const {synchronizeInvoiceInbox}=await import('@/lib/invoice-imap-sync');
  const result=await synchronizeInvoiceInbox({manual:true});
  if(!result.ok)return NextResponse.json({error:result.message},{status:503});
  return NextResponse.json({ok:true,message:result.message,status:safeImapStatus(await getImapRow())});
 }catch(error){console.error('Invoice manual sync failed',error instanceof Error?error.message:'unknown');return NextResponse.json({error:'Synchronisatie mislukt.'},{status:502})}
}
