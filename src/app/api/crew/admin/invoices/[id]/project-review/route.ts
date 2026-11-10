import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getUserPermissionLevel,permissionAtLeast} from '@/lib/auth';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
/**
 * Amend project references only before the first approval.
 * Approval and original PDF are never changed; a later correction needs a new invoice.
 */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const origin=request.headers.get('origin'),host=request.headers.get('host');
 if(!origin||!host||new URL(origin).host!==host||new URL(origin).protocol!=='https:')
  return NextResponse.json({error:'Ongeldige aanvraag.'},{status:403});
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Log opnieuw in.'},{status:401});
 const [{data:profile},perm]=await Promise.all([
  client.from('profiles').select('role').eq('id',user.id).maybeSingle(),
  getUserPermissionLevel(client,user.id,'billing')
 ]);
 if(profile?.role!=='admin'&&!permissionAtLeast(perm,'manage'))return NextResponse.json({error:'Geen toestemming.'},{status:403});
 const {id}=await params;
 if(!UUID.test(id))return NextResponse.json({error:'Ongeldige factuur.'},{status:400});
 const body=await request.json().catch(()=>null);
 const raw=Array.isArray(body?.projectNumbers)?body.projectNumbers:[];
 const numbers:string[]=[...new Set<string>((raw as unknown[]).map(v=>String(v||'').trim()))];
 if(numbers.length>15||numbers.some(n=>!/^\d{4,8}$/.test(n)))
  return NextResponse.json({error:'Gebruik geldige Rentman-projectnummers (4-8 cijfers).'}, {status:400});
 const items=Array.isArray(body?.projectLines)?body.projectLines:[];
 if(items.length>15)return NextResponse.json({error:'Te veel projectregels.'},{status:400});
 const val=(x:unknown)=>x===null||x===undefined||x===''?null:Number(x);
 const lines=numbers.map(n=>{
  const rawLine=items.find((v:Record<string,unknown>)=>v.project_number===n)||{};
  return {project_number:n,work_hours:val(rawLine.work_hours),travel_hours:val(rawLine.travel_hours),
   expenses_amount:val(rawLine.expenses_amount),source:'manual',evidence:null};
 });
 if(lines.some(item=>[item.work_hours,item.travel_hours,item.expenses_amount].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>100000))))
  return NextResponse.json({error:'Controleer de uren en onkosten.'},{status:400});
 const db=createAdminClient();
 const {data:invoice,error:loadError}=await db.from('crew_invoices')
  .select('id,status,approved_first_by,approved_second_by,forward_attempted_at,project_numbers,project_lines')
  .eq('id',id).maybeSingle();
 if(loadError||!invoice)return NextResponse.json({error:'Factuur niet gevonden.'},{status:404});
 if(!['received','in_review'].includes(invoice.status)||invoice.approved_first_by||invoice.approved_second_by||invoice.forward_attempted_at)
  return NextResponse.json({error:'Projectgegevens kunnen niet meer worden gewijzigd nadat de goedkeuring is begonnen.'},{status:409});
 const {data:updated,error}=await db.from('crew_invoices').update({
  project_numbers:numbers,project_lines:lines,updated_at:new Date().toISOString()
 }).eq('id',id).in('status',['received','in_review']).is('approved_first_by',null).is('approved_second_by',null)
  .select('id').maybeSingle();
 if(error||!updated)return NextResponse.json({error:'Projectgegevens konden niet worden opgeslagen. Vernieuw de pagina.'},{status:409});
 const {error:auditError}=await db.from('invoice_approval_audit').insert({
  invoice_id:id,actor_id:user.id,action:'project_review_updated',
  description:'Projectnummer(s), factuururen, reisuren en onkosten gecontroleerd of bijgewerkt.'
 });
 if(auditError)console.error('Project change audit could not be written',auditError.message);
 return NextResponse.json({ok:true,message:'Projectgegevens bijgewerkt. De vergelijking met shiftrapporten is vernieuwd.'});
}
