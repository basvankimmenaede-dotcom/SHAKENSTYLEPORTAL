import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
import {INVOICE_SUPPLIER_CATEGORIES,isValidSupplierEmail} from '@/lib/invoice-suppliers';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 let validOrigin=false;
 try{const origin=new URL(request.headers.get('origin')||'invalid');validOrigin=origin.protocol==='https:'&&origin.host===request.headers.get('host');}catch{}
 if(!validOrigin)return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Log opnieuw in.'},{status:401});
 const [{data:profile},level]=await Promise.all([
  client.from('profiles').select('role').eq('id',user.id).maybeSingle(),
  getUserPermissionLevel(client,user.id,'billing')
 ]);
 if(profile?.role!=='admin'&&!permissionAtLeast(level,'manage'))
  return NextResponse.json({error:'Geen toegang tot leveranciersbeheer.'},{status:403});
 const body=await request.json().catch(()=>null);
 const name=typeof body?.companyName==='string'?body.companyName.trim().replace(/\s+/g,' '):'';
 const email=typeof body?.contactEmail==='string'?body.contactEmail.trim().toLowerCase():'';
 const vatNumber=typeof body?.vatNumber==='string'?body.vatNumber.trim().slice(0,40):'';
 const kvkNumber=typeof body?.kvkNumber==='string'?body.kvkNumber.trim().slice(0,40):'';
 const category=typeof body?.defaultCostCategory==='string'?body.defaultCostCategory:'';
 if(name.length<2||name.length>160||!INVOICE_SUPPLIER_CATEGORIES.includes(category as typeof INVOICE_SUPPLIER_CATEGORIES[number]))
  return NextResponse.json({error:'Controleer de leveranciersnaam en kostensoort.'},{status:400});
 if(email&&!isValidSupplierEmail(email))
  return NextResponse.json({error:'Vul een geldig contact-e-mailadres in.'},{status:400});
 const db=createAdminClient();
 const {data,error}=await db.from('invoice_suppliers').insert({
  company_name:name,contact_email:email||null,vat_number:vatNumber||null,kvk_number:kvkNumber||null,
  default_cost_category:category
 }).select('id').single();
 if(error?.code==='23505')return NextResponse.json({error:'Deze leverancier bestaat al. Kies hem in de lijst.'},{status:409});
 if(error||!data){console.error('Invoice supplier create',error?.message);return NextResponse.json({error:'Leverancier toevoegen mislukt.'},{status:500});}
 return NextResponse.json({ok:true,id:data.id,message:'Leverancier toegevoegd. Je kunt nu een factuur koppelen.'});
}
