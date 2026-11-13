
import {NextRequest,NextResponse} from 'next/server';
import {requireModulePermission} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 try{if(!origin||!host||new URL(origin).host!==host||new URL(origin).protocol!=='https:')
  return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});}
 catch{return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});}
 await requireModulePermission('billing','manage');
 const body=await req.json().catch(()=>null);
 const receiptId=typeof body?.receiptId==='string'?body.receiptId:'';
 const billingId=typeof body?.billingItemId==='string'?body.billingItemId:'';
 if(!UUID.test(receiptId)||!UUID.test(billingId))
  return NextResponse.json({error:'Kies een geldig project en bonnetje.'},{status:400});
 const db=createAdminClient();
 const [{data:receipt},{data:project}]=await Promise.all([
  db.from('invoice_attachment_reviews').select('id,classification,billing_status').eq('id',receiptId).maybeSingle(),
  db.from('billing_items').select('id,rentman_project_number,status').eq('id',billingId).maybeSingle()
 ]);
 if(!receipt||receipt.classification!=='receipt'||receipt.billing_status!=='pending')
  return NextResponse.json({error:'Dit bonnetje is al verwerkt of niet beschikbaar.'},{status:409});
 if(!project||project.status==='invoiced'||!/^\d{4,8}$/.test(String(project.rentman_project_number||'')))
  return NextResponse.json({error:'Kies een openstaand project met een Rentman-projectnummer.'},{status:409});
 const {data:updated,error}=await db.from('invoice_attachment_reviews').update({
  project_number:project.rentman_project_number,updated_at:new Date().toISOString()
 }).eq('id',receiptId).eq('billing_status','pending').select('id').maybeSingle();
 if(error||!updated)return NextResponse.json({error:'Projecttoewijzing mislukt.'},{status:409});
 return NextResponse.json({ok:true,message:'Bonnetje gekoppeld aan project #'+project.rentman_project_number+'.'});
}
