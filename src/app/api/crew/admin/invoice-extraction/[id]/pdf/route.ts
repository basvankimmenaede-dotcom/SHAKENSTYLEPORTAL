import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Niet ingelogd'},{status:401});
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 const level=await getUserPermissionLevel(client,user.id,'billing');
 if(profile?.role!=='admin'&&!permissionAtLeast(level,'view'))
  return NextResponse.json({error:'Geen toegang'},{status:403});
 const {id}=await params;
 if(!UUID.test(id))return NextResponse.json({error:'Ongeldig bestand'},{status:400});
 const admin=createAdminClient();
 const {data:row}=await admin.from('invoice_pdf_extractions').select('message_id,storage_path').eq('id',id).maybeSingle();
 if(!row||!row.storage_path.startsWith('incoming/'+row.message_id+'/')||!row.storage_path.endsWith('.pdf'))
  return NextResponse.json({error:'Bestand niet gevonden'},{status:404});
 const {data,error}=await admin.storage.from('incoming-invoices').createSignedUrl(row.storage_path,90);
 if(error||!data?.signedUrl)return NextResponse.json({error:'Bestand kon niet worden geopend.'},{status:503});
 return NextResponse.redirect(data.signedUrl,302);
}
