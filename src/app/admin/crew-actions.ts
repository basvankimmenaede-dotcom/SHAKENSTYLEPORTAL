'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function saveCrewInvoiceIdentity(data:FormData){
 await requireAdmin();
 const id=String(data.get('crew_member_id')||'').trim();
 const companyName=String(data.get('company_name')||'').trim().replace(/\s+/g,' ');
 const companyAlias=String(data.get('company_alias')||'').trim().replace(/\s+/g,' ');
 const invoiceEmail=String(data.get('invoice_email')||'').trim().toLowerCase();
 if(!uuid.test(id))return {ok:false,message:'Ongeldig crewprofiel.'};
 if(companyName.length>160||companyAlias.length>160||invoiceEmail.length>254)
  return {ok:false,message:'Een van de ingevulde gegevens is te lang.'};
 if(invoiceEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail))
  return {ok:false,message:'Vul een geldig factuur e-mailadres in.'};
 const admin=createAdminClient();
 const {data:existing,error:readError}=await admin.from('crew_portal_members')
  .select('id,portal_deleted').eq('id',id).maybeSingle();
 if(readError||!existing||existing.portal_deleted)return {ok:false,message:'Dit crewprofiel bestaat niet (meer).'};
 const {data:updated,error}=await admin.from('crew_portal_members')
  .update({company_name:companyName||null,company_alias:companyAlias||null,invoice_email:invoiceEmail||null})
  .eq('id',id).select('id').maybeSingle();
 if(error||!updated)return {ok:false,message:'Bedrijfsgegevens konden niet worden opgeslagen.'};
 revalidatePath('/admin/users/crew');
 revalidatePath('/planning/crew-invoices');
 return {ok:true,message:'Bedrijfsgegevens opgeslagen.'};
}
