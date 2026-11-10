import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {uuidPattern} from '@/lib/invoice-processing-settings';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string;index:string}>}){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:'Niet ingelogd'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const level=await getUserPermissionLevel(supabase,user.id,'billing');
 if(profile?.role!=='admin'&&!permissionAtLeast(level,'view'))
  return NextResponse.json({error:'Geen toestemming'},{status:403});
 const {id,index}=await params;
 if(!uuidPattern.test(id)||!/^[0-9]$/.test(index))return NextResponse.json({error:'Ongeldig bestand'},{status:400});
 const admin=createAdminClient();
 const {data:message,error}=await admin.from('invoice_inbox_messages').select('attachments').eq('id',id).maybeSingle();
 if(error||!message)return NextResponse.json({error:'E-mail niet gevonden'},{status:404});
 const attachments=(Array.isArray(message.attachments)?message.attachments:[]) as Array<{path?:string;size?:number}>;
 const selected=attachments[Number(index)];
 if(!selected?.path?.startsWith('incoming/'+id+'/')||!selected.path.endsWith('.pdf')
   ||!selected.size||selected.size>15*1024*1024)
  return NextResponse.json({error:'Geen geldige PDF gevonden.'},{status:404});
 const {data:signed,error:signError}=await admin.storage.from('incoming-invoices').createSignedUrl(selected.path,90);
 if(signError||!signed?.signedUrl)return NextResponse.json({error:'PDF kon niet worden geopend.'},{status:503});
 return NextResponse.redirect(signed.signedUrl,302);
}
