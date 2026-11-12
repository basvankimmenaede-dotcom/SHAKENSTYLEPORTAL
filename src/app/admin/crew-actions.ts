'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {synchronizeRentmanCrewMembers} from '@/lib/crew/synchronize-members';

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

/** Portal access is managed independently from Rentman's planning active flag. */
export async function setCrewPortalAccess(crewMemberId:string,enabled:boolean){
 const {user}=await requireAdmin();
 if(!uuid.test(crewMemberId)||typeof enabled!=='boolean')return {ok:false,message:'Ongeldige aanvraag.'};
 const admin=createAdminClient();
 const {data:member,error:loadError}=await admin.from('crew_portal_members')
  .select('id,portal_enabled,portal_deleted,manual_disabled').eq('id',crewMemberId).maybeSingle();
 if(loadError||!member||member.portal_deleted)return {ok:false,message:'Dit crewprofiel is niet beschikbaar.'};
 if(enabled&&member.manual_disabled)return {ok:false,message:'Dit account heeft nog een aparte handmatige blokkade. Controleer dit eerst met beheer.'};
 if(member.portal_enabled===enabled)return {ok:true,message:enabled?'Portaaltoegang staat al aan.':'Portaaltoegang staat al uit.'};
 const {data:updated,error}=await admin.from('crew_portal_members')
  .update({portal_enabled:enabled,portal_access_updated_by:user.id,portal_access_updated_at:new Date().toISOString()})
  .eq('id',crewMemberId).eq('portal_enabled',!enabled).select('id').maybeSingle();
 if(error||!updated)return {ok:false,message:'Opslaan mislukt. Vernieuw de pagina en probeer opnieuw.'};
 revalidatePath('/admin/users/crew');
 revalidatePath('/admin/personeel/inloggen');
 revalidatePath('/admin/personeel');
 revalidatePath('/admin/accounts');
 return {ok:true,message:enabled?'Portaaltoegang ingeschakeld.':'Portaaltoegang uitgeschakeld.'};
}


/** Manual roster refresh for admins, independent of crew portal permissions. */
export async function syncCrewFromRentman(){
 await requireAdmin();
 try{
  const result=await synchronizeRentmanCrewMembers();
  revalidatePath('/admin/users/crew');
  revalidatePath('/planning/crew-invoices');
  return {ok:true,message:'Rentman bijgewerkt: '+result.created+' nieuw, '+result.updated+' gewijzigd.',...result};
 }catch(error){
  console.error('Manual Rentman crew sync failed',error instanceof Error?error.message:'unknown');
  return {ok:false,message:'Crewleden synchroniseren mislukt. Controleer de serverlogs.'};
 }
}
