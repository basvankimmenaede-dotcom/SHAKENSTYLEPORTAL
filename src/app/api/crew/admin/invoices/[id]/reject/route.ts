import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {getInvoiceProcessingSettings,uuidPattern} from '@/lib/invoice-processing-settings';
import {canDeclineInvoice} from '@/lib/invoice-decision';

export const runtime='nodejs';
function validOrigin(request:NextRequest){
 try{
  const origin=new URL(request.headers.get('origin')||'invalid');
  return origin.protocol==='https:'&&origin.host===request.headers.get('host');
 }catch{return false;}
}
/** Reject locally without sending an e-mail. Prior approval remains in the audit trail. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!validOrigin(request))return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Log opnieuw in.'},{status:401});
 const [{data:profile},permission]=await Promise.all([
  client.from('profiles').select('role').eq('id',user.id).maybeSingle(),
  getUserPermissionLevel(client,user.id,'billing')
 ]);
 const canManage=profile?.role==='admin'||permissionAtLeast(permission,'manage');
 if(!canManage)return NextResponse.json({error:'Geen rechten om facturen af te keuren.'},{status:403});
 const {id}=await params;
 if(!uuidPattern.test(id))return NextResponse.json({error:'Ongeldige factuur.'},{status:400});
 const body=await request.json().catch(()=>null);
 const reason=typeof body?.reason==='string'?body.reason.trim():'';
 if(reason.length<8||reason.length>1500)return NextResponse.json({error:'Geef een afkeuringsreden van 8-1500 tekens.'},{status:400});
 const db=createAdminClient();
 const [{data:invoice,error:loadError},config]=await Promise.all([
  db.from('crew_invoices').select('id,status,invoice_number,approved_first_by,approved_second_by,approval_policy_one,approval_policy_two,forward_attempted_at,forwarded_at').eq('id',id).maybeSingle(),
  getInvoiceProcessingSettings()
 ]);
 if(loadError||!invoice)return NextResponse.json({error:'Factuur niet gevonden.'},{status:404});
 if(!canDeclineInvoice(invoice,user.id,canManage,config.approver_one,config.approver_two))
  return NextResponse.json({error:'Alleen de bevoegde goedkeurder mag deze factuur afkeuren.'},{status:403});
 let update=db.from('crew_invoices').update({
  status:'rejected',correction_reason:reason,correction_notified_at:null,
  approved_first_by:null,updated_at:new Date().toISOString()
 }).eq('id',id).eq('status',invoice.status).is('approved_second_by',null)
  .is('forward_attempted_at',null).is('forwarded_at',null);
 update=invoice.approved_first_by?update.eq('approved_first_by',invoice.approved_first_by):update.is('approved_first_by',null);
 const {data:changed,error}=await update.select('id').maybeSingle();
 if(error||!changed)return NextResponse.json({error:'Factuur is ondertussen gewijzigd. Vernieuw het overzicht.'},{status:409});
 const {error:auditError}=await db.from('invoice_approval_audit').insert({
  invoice_id:id,actor_id:user.id,action:'rejected',
  description:'Factuur afgekeurd en eerder eerste akkoord ingetrokken. Reden: '+reason
 });
 if(auditError)console.error('Invoice rejection audit failed',auditError.message);
 return NextResponse.json({ok:true,message:'Factuur afgekeurd en in het archief geplaatst. Er is geen e-mail verstuurd.'});
}
