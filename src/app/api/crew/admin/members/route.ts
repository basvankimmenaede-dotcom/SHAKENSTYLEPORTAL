import { NextRequest,NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
export const runtime='nodejs';
export async function PATCH(request:NextRequest){
 await requireModulePermission('user_admin','manage');
 let body:{id?:string;email?:string|null;active?:boolean;remove?:boolean};
 try{body=await request.json()}catch{return NextResponse.json({error:'Ongeldig verzoek'},{status:400})}
 if(!body.id||(!('email' in body)&&!body.remove))return NextResponse.json({error:'Ontbrekende gegevens'},{status:400});
 if(body.remove){const admin=createAdminClient();const {error}=await admin.from('crew_portal_members').update({portal_deleted:true,manual_disabled:true,active:false}).eq('id',body.id);return error?NextResponse.json({error:'Verwijderen mislukt'},{status:500}):NextResponse.json({ok:true});}
 const email=String(body.email||'').trim().toLowerCase();
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:'Ongeldig e-mailadres'},{status:400});
 const admin=createAdminClient();
 if(email){
  let found=false;
  for(let page=1;page<=20;page++){
   const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
   if(error)return NextResponse.json({error:'Authenticatiegegevens konden niet worden gecontroleerd.'},{status:503});
   if(data.users.some(u=>u.email?.toLowerCase()===email)){found=true;break}
   if(data.users.length<1000)break;
  }
  if(!found){
   const {error}=await admin.auth.admin.createUser({email,email_confirm:true});
   if(error)return NextResponse.json({error:'Inlogaccount kon niet worden voorbereid.'},{status:503});
  }
 }
 const {error}=await admin.from('crew_portal_members')
 .update({login_email_override:email||null,...(typeof body.active==='boolean'?{active:body.active,manual_disabled:!body.active,portal_deleted:false}:{})}).eq('id',body.id);
 if(error)return NextResponse.json({error:'Opslaan mislukt. Controleer of het e-mailadres al wordt gebruikt.'},{status:409});
 return NextResponse.json({ok:true});
}
