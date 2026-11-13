
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {synchronizeInvoiceInbox} from '@/lib/invoice-imap-sync';

export const runtime='nodejs';
export const maxDuration=60;

/** Billing managers can fetch new invoices, but IMAP settings remain admin-only. */
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 let validOrigin=false;
 try{validOrigin=Boolean(origin&&host&&new URL(origin).protocol==='https:'&&new URL(origin).host===host);}
 catch{/* invalid origin */}
 if(!validOrigin)return NextResponse.json({error:'Ongeldige herkomst van verzoek.'},{status:403});
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Log eerst in.'},{status:401});
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const permission=await getUserPermissionLevel(client,user.id,'billing');
 if(profile?.role!=='admin'&&!permissionAtLeast(permission,'manage'))
  return NextResponse.json({error:'Je hebt geen rechten om facturen te synchroniseren.'},{status:403});
 try{
  const result=await synchronizeInvoiceInbox({manual:true});
  if(!result.ok)return NextResponse.json({error:result.message},{status:503});
  return NextResponse.json({ok:true,message:result.message,imported:result.imported||0,skipped:result.skipped||0});
 }catch(error){
  console.error('Manual invoice inbox synchronization failed',error instanceof Error?error.message:'unknown');
  return NextResponse.json({error:'Synchroniseren is mislukt. Controleer de IMAP-verbinding.'},{status:502});
 }
}
