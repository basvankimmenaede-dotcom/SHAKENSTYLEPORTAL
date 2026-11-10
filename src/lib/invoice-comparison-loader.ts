import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import type {InvoiceProjectLine} from '@/lib/invoice-project-recognition';
import {
 compareInvoiceToShiftReports,type InvoiceCheck,
 type InvoiceProjectRef,type InvoiceAssignment,type InvoiceShiftReport,type InvoiceBillingItem
} from '@/lib/invoice-shift-comparison';

export type ReviewInvoiceInput={id:string;crew_member_id:string;project_numbers:string[]|null;project_lines:unknown};
export async function loadCrewInvoiceComparisons(invoices:ReviewInvoiceInput[]):Promise<Record<string,InvoiceCheck>>{
 const initial:Record<string,InvoiceCheck>={};
 if(!invoices.length)return initial;
 const numbers=[...new Set(invoices.flatMap(inv=>Array.isArray(inv.project_numbers)?inv.project_numbers:[]))].filter(n=>/^\d{4,8}$/.test(n));
 if(!numbers.length){
  for(const invoice of invoices)initial[invoice.id]={status:'unverified',projects:[]};
  return initial;
 }
 const db=createAdminClient();
 const {data:directory,error:directoryError}=await db.from('crew_invoice_project_catalog')
  .select('rentman_project_id,project_number,project_name').in('project_number',numbers).limit(400);
 if(directoryError)throw new Error('Projectkoppelingen konden niet worden geladen.');
 const catalog=(directory||[]) as InvoiceProjectRef[];
 const projectIds=[...new Set(catalog.map(p=>p.rentman_project_id))];
 const crewIds=[...new Set(invoices.map(inv=>inv.crew_member_id))];
 let assignments:InvoiceAssignment[]=[],reports:InvoiceShiftReport[]=[],billing:InvoiceBillingItem[]=[];
 if(projectIds.length){
  const [assignmentResult,billingResult]=await Promise.all([
   db.from('crew_portal_assignments')
    .select('id,crew_member_id,rentman_project_id,starts_at,ends_at')
    .in('rentman_project_id',projectIds).in('crew_member_id',crewIds).limit(3500),
   db.from('billing_items').select('id,rentman_project_id,status').in('rentman_project_id',projectIds).limit(2000)
  ]);
  if(assignmentResult.error||billingResult.error)throw new Error('Shifts of facturatieprojecten konden niet worden geladen.');
  assignments=(assignmentResult.data||[]) as InvoiceAssignment[];
  billing=(billingResult.data||[]) as InvoiceBillingItem[];
  const assignmentIds=assignments.map(a=>a.id);
  for(let i=0;i<assignmentIds.length;i+=180){
   const {data,error}=await db.from('crew_shift_reports')
    .select('assignment_id,work_started_at,work_ended_at,break_minutes,travel_minutes,expenses_amount,status')
    .in('assignment_id',assignmentIds.slice(i,i+180)).limit(500);
   if(error)throw new Error('Shiftrapporten konden niet worden geladen.');
   reports.push(...(data||[]) as InvoiceShiftReport[]);
  }
 }
 for(const inv of invoices){
  const valid=Array.isArray(inv.project_numbers)?inv.project_numbers.filter(n=>/^\d{4,8}$/.test(n)):[];
  const lines=(Array.isArray(inv.project_lines)?inv.project_lines:[]) as InvoiceProjectLine[];
  initial[inv.id]=compareInvoiceToShiftReports({
   crewMemberId:inv.crew_member_id,projectNumbers:valid,projectLines:lines,
   catalog,assignments,reports,billing
  });
 }
 return initial;
}
