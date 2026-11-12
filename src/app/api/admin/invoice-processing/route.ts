import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getInvoiceProcessingSettings,listEligibleApprovers,invoiceEmailPattern,uuidPattern} from '@/lib/invoice-processing-settings';
export const runtime='nodejs';
async function authorize(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 let url:URL;try{url=new URL(origin||'invalid');}catch{return null;}
 if(!host||url.protocol!=='https:'||url.host!==host)return null;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return null;
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 return profile?.role==='admin'?user:null;
}
export async function POST(request:NextRequest){
 const user=await authorize(request);
 if(!user)return NextResponse.json({error:'Alleen beheerders mogen deze instellingen wijzigen.'},{status:403});
 const data=await request.json().catch(()=>null);
 if(!data||data.action!=='save')return NextResponse.json({error:'Onjuiste actie.'},{status:400});
 const approverOne=typeof data.approverOne==='string'?data.approverOne.trim():'';
 const approverTwo=typeof data.approverTwo==='string'?data.approverTwo.trim():'';
 const forwardEmail=typeof data.forwardEmail==='string'?data.forwardEmail.trim().toLowerCase():'';
 const forwardSenderEmail=typeof data.forwardSenderEmail==='string'?data.forwardSenderEmail.trim().toLowerCase():'';
 if((approverOne&&!uuidPattern.test(approverOne))||(approverTwo&&!uuidPattern.test(approverTwo))||
   (approverOne&&approverTwo&&approverOne===approverTwo))
  return NextResponse.json({error:'Selecteer twee verschillende geldige accounts.'},{status:400});
 if(forwardEmail&&(!invoiceEmailPattern.test(forwardEmail)||forwardEmail.length>254))
  return NextResponse.json({error:'Vul een geldig doorstuuradres in.'},{status:400});
 if(forwardSenderEmail&&(!invoiceEmailPattern.test(forwardSenderEmail)||forwardSenderEmail.length>254))
  return NextResponse.json({error:'Vul een geldig afzenderadres in.'},{status:400});
 const eligible=await listEligibleApprovers();
 const allowed=new Set(eligible.map(a=>a.id));
 if((approverOne&&!allowed.has(approverOne))||(approverTwo&&!allowed.has(approverTwo)))
  return NextResponse.json({error:'Een geselecteerd account heeft geen rechten voor factuurgoedkeuring.'},{status:400});
 const admin=createAdminClient();
 const now=new Date().toISOString();
 const {error}=await admin.from('invoice_processing_settings').update({
  approver_one:approverOne||null,approver_two:approverTwo||null,
  forward_email:forwardEmail,forward_sender_email:forwardSenderEmail,
  updated_at:now,updated_by:user.id
 }).eq('id',1);
 if(error)return NextResponse.json({error:'Instellingen konden niet worden opgeslagen.'},{status:500});
 // Existing Google columns remain unused in the database for backward compatibility.
 const next=await getInvoiceProcessingSettings();
 return NextResponse.json({ok:true,message:'Factuurinstellingen opgeslagen.',
  settings:{approverOne:next.approver_one||'',approverTwo:next.approver_two||'',
   forwardEmail:next.forward_email,forwardSenderEmail:next.forward_sender_email||''}});
}
