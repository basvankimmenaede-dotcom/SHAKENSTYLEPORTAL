'use server';
import { revalidatePath } from 'next/cache';
import { requirePlanningUser, requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function updateFuelCardDistanceSetting(formData:FormData){
  const {supabase,user,profile}=await requirePlanningUser(); if(profile.role!=='admin')return;
  const value=Math.round(Number(formData.get('fuel_card_distance_km'))); if(!Number.isFinite(value)||value<1)return;
  const {error}=await supabase.from('planning_settings').upsert({id:1,fuel_card_distance_km:value,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'id'});
  if(error)throw new Error(error.message); revalidatePath('/planning'); revalidatePath('/planning/instellingen');
}

type RecurringTaskKey='closing'|'billing';
export async function updateRecurringTaskSetting(formData:FormData){
  const {supabase,user,profile}=await requirePlanningUser(); if(profile.role!=='admin')return {ok:false,message:'Geen toegang.'};
  const key=String(formData.get('task_key')??'') as RecurringTaskKey; if(!['closing','billing'].includes(key))return {ok:false,message:'Onbekende terugkerende taak.'};
  const {data:row}=await supabase.from('planning_settings').select('recurring_tasks').eq('id',1).maybeSingle();
  const current=(row?.recurring_tasks&&typeof row.recurring_tasks==='object')?row.recurring_tasks as Record<string,Record<string,unknown>>:{};
  const title=String(formData.get('title')??'').trim(); const active=formData.get('active')==='on'; const raw=String(formData.get('task_area')??(key==='closing'?'both':'office')); const task_area=['office','warehouse','both'].includes(raw)?raw:'office'; const weekday=Math.min(7,Math.max(1,Number(formData.get('weekday')??3)));
  current[key]={...(current[key]??{}),title:title||(key==='closing'?'Afsluitlijst afronden':'Facturatie'),active,task_area,schedule:key==='closing'?'weekdays':'weekly',...(key==='billing'?{weekday}:{})};
  const {error}=await supabase.from('planning_settings').upsert({id:1,recurring_tasks:current,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'id'});
  if(error)return {ok:false,message:error.message}; revalidatePath('/planning/instellingen'); revalidatePath('/planning'); return {ok:true,message:'Terugkerende taak opgeslagen.'};
}

/** Save only the public-facing destination address. IMAP credentials stay outside this setting. */
export async function updateIncomingInvoiceEmail(formData:FormData){
  const {user}=await requireAdmin();
  const value=String(formData.get('incoming_invoice_email')??'').trim().toLowerCase();
  if(value.length>254 || (value!=='' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))){
    return {ok:false,message:'Vul een geldig e-mailadres in.'};
  }
  const admin=createAdminClient();
  const {data,error}=await admin.from('planning_settings')
    .update({incoming_invoice_email:value,updated_at:new Date().toISOString(),updated_by:user.id})
    .eq('id',1).select('id').maybeSingle();
  if(error || !data){
    console.error('Factuur e-mailadres opslaan mislukt',error?.message??'Instellingenrecord ontbreekt');
    return {ok:false,message:'Opslaan is niet gelukt.'};
  }
  revalidatePath('/planning/instellingen');
  revalidatePath('/planning/crew-invoices');
  return {ok:true,message:value?'Factuur e-mailadres opgeslagen.':'Factuur e-mailadres leeggemaakt.'};
}
