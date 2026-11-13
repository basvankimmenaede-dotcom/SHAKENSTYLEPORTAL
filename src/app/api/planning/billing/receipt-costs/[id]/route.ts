
import {NextRequest,NextResponse} from 'next/server';
import {requireModulePermission} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
async function projectData(id:string){
 if(!UUID.test(id))return null;
 const db=createAdminClient();
 const {data,error}=await db.from('billing_items')
  .select('id,rentman_project_number,project_name,status').eq('id',id).maybeSingle();
 if(error)throw new Error('Facturatieproject kon niet worden geladen.');
 return data;
}
function validOrigin(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 try{return Boolean(origin&&host&&new URL(origin).host===host&&new URL(origin).protocol==='https:');}
 catch{return false;}
}
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 await requireModulePermission('billing','view');
 const {id}=await params;
 const project=await projectData(id);
 if(!project)return NextResponse.json({error:'Project niet gevonden.'},{status:404});
 const db=createAdminClient();
 const number=String(project.rentman_project_number||'');
 let query=db.from('invoice_attachment_reviews')
  .select('id,extraction_id,message_id,attachment_index,merchant,document_date,cost_amount,project_number,linked_invoice_id,note,billing_status,billing_item_id,sale_description,sale_price,sale_vat_rate')
  .eq('classification','receipt')
  .order('reviewed_at',{ascending:false}).limit(250);
 query=/^\d{4,8}$/.test(number)?query.eq('project_number',number):query.eq('billing_item_id',id);
 const {data,error}=await query;
 if(error)return NextResponse.json({error:'Bonnetjes konden niet worden geladen.'},{status:500});
 const rows=(data||[]).filter(item=>item.billing_status!=='included'||item.billing_item_id===id);
 const ids=rows.map(r=>r.extraction_id);
 const {data:extractions,error:pdfError}=ids.length
  ?await db.from('invoice_pdf_extractions').select('id,filename').in('id',ids)
  :{data:[],error:null};
 if(pdfError)return NextResponse.json({error:'Bijlagennamen konden niet worden geladen.'},{status:500});
 const names=new Map((extractions||[]).map(x=>[x.id,x.filename]));
 return NextResponse.json({receipts:rows.map(row=>({...row,filename:names.get(row.extraction_id)||'Bonnetje.pdf'}))});
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!validOrigin(req))return NextResponse.json({error:'Ongeldige herkomst.'},{status:403});
 await requireModulePermission('billing','manage');
 const {id}=await params;
 const project=await projectData(id);
 if(!project)return NextResponse.json({error:'Project niet gevonden.'},{status:404});
 if(project.status==='invoiced')return NextResponse.json({error:'Gefactureerd project is vergrendeld.'},{status:409});
 const body=await req.json().catch(()=>null);
 const receiptId=typeof body?.receiptId==='string'?body.receiptId:'';
 const action=body?.action;
 if(!UUID.test(receiptId)||!['include','not_bill','already_processed','pending'].includes(action))
  return NextResponse.json({error:'Ongeldige bonnetjesactie.'},{status:400});
 const db=createAdminClient();
 const {data:receipt}=await db.from('invoice_attachment_reviews')
  .select('id,classification,project_number,billing_status,billing_item_id').eq('id',receiptId).maybeSingle();
 if(!receipt||receipt.classification!=='receipt')
  return NextResponse.json({error:'Bonnetje niet gevonden.'},{status:404});
 if(receipt.project_number!==project.rentman_project_number||
    receipt.billing_item_id&&receipt.billing_item_id!==id)
  return NextResponse.json({error:'Dit bonnetje hoort niet bij dit project.'},{status:409});
 if(action==='include'&&receipt.billing_status!=='pending')
  return NextResponse.json({error:'Dit bonnetje is al afgehandeld. Zet het eerst terug naar Te beoordelen.'},{status:409});
 if(action==='pending'&&receipt.billing_status==='pending')
  return NextResponse.json({ok:true,message:'Staat al ter beoordeling.'});
 if(action!=='pending'&&action!=='include'&&receipt.billing_status!=='pending')
  return NextResponse.json({error:'Zet deze post eerst terug naar Te beoordelen.'},{status:409});
 let updates:Record<string,unknown>={
  billing_status:action==='include'?'included':action,
  billing_item_id:null,sale_description:null,sale_price:null,sale_vat_rate:null,
  updated_at:new Date().toISOString()
 };
 if(action==='include'){
  const description=typeof body?.description==='string'?body.description.trim():'';
  const price=Number(body?.unitPrice);
  const vatRate=Number(body?.vatRate);
  if(!description||description.length>200||body?.unitPrice===''||!Number.isFinite(price)||price<0||price>1000000||![0,9,21].includes(vatRate))
   return NextResponse.json({error:'Vul de verkoopomschrijving, verkoopprijs excl. btw en btw-tarief in.'},{status:400});
  updates={...updates,billing_item_id:id,sale_description:description,sale_price:Math.round(price*100)/100,sale_vat_rate:vatRate};
 }
 // Compare-and-swap ensures one receipt can never be included twice.
 const {data:updated,error}=await db.from('invoice_attachment_reviews').update(updates)
  .eq('id',receiptId).eq('billing_status',receipt.billing_status).select('id').maybeSingle();
 if(error||!updated)return NextResponse.json({error:'Bonnetje is intussen gewijzigd. Vernieuw het overzicht.'},{status:409});
 return NextResponse.json({ok:true,message:action==='include'?'Bonnetje toegevoegd aan de klantcalculatie.':
  action==='not_bill'?'Niet doorbelasten vastgelegd.':
  action==='already_processed'?'Als al verwerkt gemarkeerd.':'Bonnetje opnieuw ter beoordeling.'});
}
