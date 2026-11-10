import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
export type InvoiceProcessingSettings={
 id:number;approver_one:string|null;approver_two:string|null;forward_email:string;
 google_project_id:string;google_processor_id:string;google_location:'eu'|'us';
 google_service_account_encrypted:string|null;google_tested_at:string|null;google_test_message:string|null;
};
export type EligibleApprover={id:string;full_name:string};
export async function getInvoiceProcessingSettings():Promise<InvoiceProcessingSettings>{
 const {data,error}=await createAdminClient().from('invoice_processing_settings').select('*').eq('id',1).single();
 if(error||!data)throw new Error('Factuurverwerking-instellingen zijn niet bereikbaar.');
 return data as InvoiceProcessingSettings;
}
export async function listEligibleApprovers():Promise<EligibleApprover[]>{
 const admin=createAdminClient();
 const [admins,perm]=await Promise.all([
   admin.from('profiles').select('id,full_name,role').eq('role','admin'),
   admin.from('user_permissions').select('user_id').eq('permission_key','billing').eq('access_level','manage')
 ]);
 if(admins.error||perm.error)throw new Error('Gebruikersrechten konden niet worden geladen.');
 const ids=new Set<string>((admins.data||[]).map(x=>x.id));
 (perm.data||[]).forEach(x=>ids.add(x.user_id));
 if(!ids.size)return [];
 const {data, error}=await admin.from('profiles').select('id,full_name').in('id',[...ids]);
 if(error)throw new Error('Goedgekeurde accounts konden niet worden geladen.');
 return (data||[]).map(x=>({id:x.id,full_name:(x.full_name||'Account zonder naam').trim()}))
   .sort((a,b)=>a.full_name.localeCompare(b.full_name,'nl'));
}
export function publicProcessingSettings(row:InvoiceProcessingSettings){
 return {
  approverOne:row.approver_one||'',approverTwo:row.approver_two||'',forwardEmail:row.forward_email,
  googleProjectId:row.google_project_id,googleProcessorId:row.google_processor_id,
  googleLocation:row.google_location,googleHasKey:Boolean(row.google_service_account_encrypted),
  googleTestedAt:row.google_tested_at,googleTestMessage:row.google_test_message
 };
}
export const invoiceEmailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
