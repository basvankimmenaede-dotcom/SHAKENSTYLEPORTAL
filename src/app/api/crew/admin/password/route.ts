import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime='nodejs';
export async function POST(request:NextRequest){
 await requireAdmin();
 let body:{id?:string;password?:string};
 try{body=await request.json()}catch{return NextResponse.json({error:'Ongeldig verzoek.'},{status:400})}
 const id=String(body.id||'');
 const password=String(body.password||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||password.length<12||password.length>128)
  return NextResponse.json({error:'Gebruik een wachtwoord van minimaal 12 tekens.'},{status:400});
 const admin=createAdminClient();
 const {data:member,error:memberError}=await admin.from('crew_portal_members').select('email,login_email_override,active').eq('id',id).maybeSingle();
 if(memberError||!member)return NextResponse.json({error:'Medewerker niet gevonden.'},{status:404});
 if(!member.active)return NextResponse.json({error:'Activeer de medewerker eerst.'},{status:409});
 const email=String(member.login_email_override||member.email).trim().toLowerCase();
 if(!email)return NextResponse.json({error:'Geen geldig inlogadres.'},{status:400});
 let userId:string|null=null;
 for(let page=1;page<=20;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
  if(error)return NextResponse.json({error:'Auth-account kon niet worden gecontroleerd.'},{status:503});
  const found=data.users.find(u=>u.email?.toLowerCase()===email);
  if(found){userId=found.id;break}
  if(data.users.length<1000)break;
 }
 if(userId){
  // The same Auth identity can be used by other portal modules. Never reset those passwords.
  const {data:profile,error:profileError}=await admin.from('profiles').select('id').eq('id',userId).maybeSingle();
  if(profileError)return NextResponse.json({error:'Accountcontrole mislukt.'},{status:503});
  if(profile)return NextResponse.json({error:'Dit e-mailadres heeft ook een bestaand portalaccount. Het wachtwoord kan hier niet worden gewijzigd.'},{status:409});
  const {error}=await admin.auth.admin.updateUserById(userId,{password,email_confirm:true});
  if(error)return NextResponse.json({error:'Wachtwoord instellen mislukt.'},{status:503});
 }else{
  const {error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(error)return NextResponse.json({error:'Account aanmaken mislukt.'},{status:503});
 }
 return NextResponse.json({ok:true});
}
