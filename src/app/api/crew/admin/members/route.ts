import { NextRequest,NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
export const runtime='nodejs';
export async function PATCH(request:NextRequest){
 await requireModulePermission('user_admin','manage');
 let body:{id?:string;email?:string|null;active?:boolean};
 try{body=await request.json()}catch{return NextResponse.json({error:'Ongeldig verzoek'},{status:400})}
 if(!body.id||!('email' in body))return NextResponse.json({error:'Ontbrekende gegevens'},{status:400});
 const email=String(body.email||'').trim().toLowerCase();
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:'Ongeldig e-mailadres'},{status:400});
 const admin=createAdminClient();
 const {error}=await admin.from('crew_portal_members')
 .update({login_email_override:email||null,...(typeof body.active==='boolean'?{active:body.active}:{})}).eq('id',body.id);
 if(error)return NextResponse.json({error:'Opslaan mislukt. Controleer of het e-mailadres al wordt gebruikt.'},{status:409});
 return NextResponse.json({ok:true});
}
