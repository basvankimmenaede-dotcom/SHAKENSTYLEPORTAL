import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
export type AccountCategory='customer'|'crew'|'internal'|'unlinked';
type CrewIdentity={email?:string|null;rentman_email?:string|null;login_email_override?:string|null};
const normalize=(email:string|null|undefined)=>(email||'').trim().toLowerCase();
export function crewIdentityEmails(rows:CrewIdentity[]){
 const values=new Set<string>();
 for(const row of rows){
  for(const email of [row.email,row.rentman_email,row.login_email_override]){
   const key=normalize(email);if(key)values.add(key);
  }
 }
 return values;
}
export function classifyAccount({role,email,distributorId,hasBrandAccess,crewEmails}:{
 role:string;email:string|null|undefined;distributorId:number|null;
 hasBrandAccess:boolean;crewEmails:Set<string>;
}):AccountCategory{
 if(role==='admin'||role==='warehouse')return 'internal';
 if(crewEmails.has(normalize(email)))return 'crew';
 if(distributorId!==null||hasBrandAccess)return 'customer';
 return 'unlinked';
}
export async function getAccountDirectoryCounts(){
 const admin=createAdminClient();
 const [crew,customers,companies,brands,usersPage]=await Promise.all([
  admin.from('crew_portal_members').select('email,rentman_email,login_email_override,portal_enabled,portal_deleted'),
  admin.from('profiles').select('id,role,distributor_id'),
  admin.from('distributors').select('*',{count:'exact',head:true}),
  admin.from('user_brand_access').select('user_id'),
  admin.auth.admin.listUsers({page:1,perPage:200})
 ]);
 if(crew.error||customers.error||usersPage.error)throw new Error('Accountstatistieken konden niet volledig worden opgehaald.');
 const authUsers=[...(usersPage.data?.users||[])];
 let page=2;
 while(authUsers.length&&authUsers.length%200===0&&page<=20){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
  if(error||!data?.users?.length)break;
  authUsers.push(...data.users);
  if(data.users.length<200)break;
  page++;
 }
 const crewEmails=crewIdentityEmails(crew.data||[]);
 const byId=new Map(authUsers.map(u=>[u.id,u.email||'']));
 const brandAccess=new Set((brands.data||[]).map(b=>String(b.user_id)));
 const kinds={customer:0,crew:0,internal:0,unlinked:0};
 for(const profile of customers.data||[]){
  const category=classifyAccount({role:String(profile.role),email:byId.get(profile.id)||null,
   distributorId:profile.distributor_id===null?null:Number(profile.distributor_id),
   hasBrandAccess:brandAccess.has(profile.id),crewEmails});
  kinds[category]++;
 }
 const liveCrew=(crew.data||[]).filter(c=>!c.portal_deleted);
 return {
  crew:liveCrew.length,crewActive:liveCrew.filter(c=>c.portal_enabled).length,
  customers:kinds.customer,internal:kinds.internal,
  crewAccounts:kinds.crew,unlinked:kinds.unlinked,organizations:companies.count??0
 };
}
