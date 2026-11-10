import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {encryptSecret} from '@/lib/invoice-imap';
import {getInvoiceProcessingSettings,listEligibleApprovers,publicProcessingSettings,invoiceEmailPattern,uuidPattern} from '@/lib/invoice-processing-settings';
import {testGoogleDocumentAi} from '@/lib/google-document-ai';
export const runtime='nodejs';
export const maxDuration=40;
async function authorize(req:NextRequest){
 const origin=req.headers.get('origin'),host=req.headers.get('host');
 let url:URL;
 try{url=new URL(origin||'invalid');}catch{return false;}
 if(!host||url.protocol!=='https:'||url.host!==host)return false;
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return false;
 const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
 return profile?.role==='admin'?user:null;
}
export async function POST(request:NextRequest){
 const user=await authorize(request);
 if(!user)return NextResponse.json({error:'Alleen beheerders mogen deze instellingen wijzigen.'},{status:403});
 const data=await request.json().catch(()=>null);
 if(!data||!['save','test'].includes(data.action))return NextResponse.json({error:'Onjuiste actie.'},{status:400});
 const admin=createAdminClient(),settings=await getInvoiceProcessingSettings();
 if(data.action==='test'){
  try{
   const name=await testGoogleDocumentAi(settings);
   const tested=new Date().toISOString();
   const {error}=await admin.from('invoice_processing_settings').update({google_tested_at:tested,google_test_message:name,
    updated_at:tested,updated_by:user.id}).eq('id',1);
   if(error)throw new Error('Teststatus kon niet worden opgeslagen.');
   const next=await getInvoiceProcessingSettings();
   return NextResponse.json({ok:true,message:'Google Document AI verbonden: '+name,settings:publicProcessingSettings(next)});
  }catch(error){
   const message=error instanceof Error?error.message:'Google verbindingstest mislukt.';
   console.error('Google Document AI test failed',message.slice(0,250));
   return NextResponse.json({error:message},{status:502});
  }
 }
 const approverOne=typeof data.approverOne==='string'?data.approverOne.trim():'';
 const approverTwo=typeof data.approverTwo==='string'?data.approverTwo.trim():'';
 const forwardEmail=typeof data.forwardEmail==='string'?data.forwardEmail.trim().toLowerCase():'';
 const googleProjectId=typeof data.googleProjectId==='string'?data.googleProjectId.trim():'';
 const googleProcessorId=typeof data.googleProcessorId==='string'?data.googleProcessorId.trim():'';
 const googleLocation=data.googleLocation==='us'?'us':'eu';
 const serviceJson=typeof data.googleServiceAccountJson==='string'?data.googleServiceAccountJson.trim():'';
 if((approverOne&&!uuidPattern.test(approverOne))||(approverTwo&&!uuidPattern.test(approverTwo))||(approverOne&&approverTwo&&approverOne===approverTwo))
  return NextResponse.json({error:'Selecteer twee verschillende geldige accounts.'},{status:400});
 if(forwardEmail&&(!invoiceEmailPattern.test(forwardEmail)||forwardEmail.length>254))
  return NextResponse.json({error:'Vul een geldig doorstuuradres in.'},{status:400});
 if((googleProjectId&&!/^[a-z][a-z0-9-]{3,62}$/.test(googleProjectId))||
    (googleProcessorId&&!/^[a-z0-9]{8,40}$/i.test(googleProcessorId)))
  return NextResponse.json({error:'Google project-ID of processor-ID is ongeldig.'},{status:400});
 const eligible=await listEligibleApprovers();
 const allowed=new Set(eligible.map(a=>a.id));
 if((approverOne&&!allowed.has(approverOne))||(approverTwo&&!allowed.has(approverTwo)))
  return NextResponse.json({error:'Een geselecteerd account heeft geen rechten voor factuurgoedkeuring.'},{status:400});
 let secret=settings.google_service_account_encrypted;
 if(serviceJson){
  if(serviceJson.length>22000)return NextResponse.json({error:'Google serviceaccount-bestand is te groot.'},{status:400});
  try{
   const parsed=JSON.parse(serviceJson) as {type?:string;client_email?:string;private_key?:string};
   if(parsed.type!=='service_account'||!parsed.client_email?.endsWith('.gserviceaccount.com')||!parsed.private_key?.includes('BEGIN PRIVATE KEY'))
    throw new Error('Ongeldige sleutel');
   secret=encryptSecret(serviceJson);
  }catch{return NextResponse.json({error:'Voeg de volledige JSON-sleutel van een Google serviceaccount toe.'},{status:400});}
 }
 const googleChanged=googleProjectId!==settings.google_project_id||googleProcessorId!==settings.google_processor_id
  ||googleLocation!==settings.google_location||Boolean(serviceJson);
 const now=new Date().toISOString();
 const {error}=await admin.from('invoice_processing_settings').update({
  approver_one:approverOne||null,approver_two:approverTwo||null,forward_email:forwardEmail,
  google_project_id:googleProjectId,google_processor_id:googleProcessorId,google_location:googleLocation,
  google_service_account_encrypted:secret,google_tested_at:googleChanged?null:settings.google_tested_at,
  google_test_message:googleChanged?null:settings.google_test_message,updated_at:now,updated_by:user.id
 }).eq('id',1);
 if(error){console.error('Invoice settings save failed',error.message);return NextResponse.json({error:'Instellingen konden niet worden opgeslagen.'},{status:500});}
 const next=await getInvoiceProcessingSettings();
 return NextResponse.json({ok:true,message:googleChanged?'Opgeslagen. Test nu de verbinding met Google Document AI.':'Factuurinstellingen opgeslagen.',settings:publicProcessingSettings(next)});
}
