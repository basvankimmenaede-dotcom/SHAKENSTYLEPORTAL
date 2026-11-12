/**
 * Compares submitted shift reports with invoice claims. Planned hours are only context;
 * an absent report is not evidence that an invoice is incorrect.
 */
import type {InvoiceProjectLine} from '@/lib/invoice-project-recognition';
export type InvoiceProjectRef={rentman_project_id:number;project_number:string;project_name:string};
export type InvoiceAssignment={id:string;crew_member_id:string;rentman_project_id:number;starts_at:string;ends_at:string};
export type InvoiceShiftReport={assignment_id:string;work_started_at:string;work_ended_at:string;break_minutes:number|null;travel_minutes:number|null;expenses_amount:number|string|null;status:string};
export type InvoiceBillingItem={rentman_project_id:number;status:string;id:string};
export type ProjectCheck={
 projectNumber:string;projectId:number|null;projectName:string|null;
 status:'match'|'difference'|'missing_report'|'missing_assignment'|'unverified'|'unknown_project';
 plannedShifts:number;submittedShifts:number;plannedHours:number;reportedHours:number;
 invoicedHours:number|null;differenceHours:number|null;reportedTravelHours:number;invoicedTravelHours:number|null;
 travelDifferenceHours:number|null;reportedExpenses:number;invoicedExpenses:number|null;expensesDifference:number|null;
 billingStatus:string|null;billingItemId:string|null;note:string;
};
export type InvoiceCheck={status:'match'|'difference'|'missing_report'|'unverified';projects:ProjectCheck[]};
const two=(value:number)=>Math.round(value*100)/100;
function durationHours(start:string,end:string,breakMinutes=0){
 const ms=new Date(end).getTime()-new Date(start).getTime();
 return Number.isFinite(ms)?Math.max(0,ms/3600000-breakMinutes/60):0;
}
export function compareInvoiceToShiftReports(input:{
 crewMemberId:string;projectNumbers:string[];projectLines:InvoiceProjectLine[];
 catalog:InvoiceProjectRef[];assignments:InvoiceAssignment[];
 reports:InvoiceShiftReport[];billing:InvoiceBillingItem[];
}):InvoiceCheck{
 const {crewMemberId,projectNumbers,projectLines,catalog,assignments,reports,billing}=input;
 const directory=new Map(catalog.map(p=>[p.project_number,p]));
 const reportByAssignment=new Map(reports.filter(r=>r.status==='submitted').map(r=>[r.assignment_id,r]));
 const checks:ProjectCheck[]=[];
 for(const n of [...new Set(projectNumbers)]){
  const project=directory.get(n);
  const line=projectLines.find(line=>line.project_number===n);
  const assignmentsForProject=project?assignments.filter(a=>a.crew_member_id===crewMemberId&&a.rentman_project_id===project.rentman_project_id):[];
  const actualReports=assignmentsForProject.map(a=>reportByAssignment.get(a.id)).filter((r):r is InvoiceShiftReport=>Boolean(r));
  const planned=two(assignmentsForProject.reduce((sum,a)=>sum+durationHours(a.starts_at,a.ends_at),0));
  const worked=two(actualReports.reduce((sum,r)=>sum+durationHours(r.work_started_at,r.work_ended_at,Number(r.break_minutes||0)),0));
  const travel=two(actualReports.reduce((sum,r)=>sum+Number(r.travel_minutes||0)/60,0));
  const expenses=two(actualReports.reduce((sum,r)=>sum+Number(r.expenses_amount||0),0));
  const invoiceHours=line?.work_hours??null,travelClaim=line?.travel_hours??null,expensesClaim=line?.expenses_amount??null;
  const hoursDiff=invoiceHours===null?null:two(invoiceHours-worked);
  const travelDiff=travelClaim===null?null:two(travelClaim-travel);
  const expensesDiff=expensesClaim===null?null:two(expensesClaim-expenses);
  const queueItem=project?billing.find(b=>b.rentman_project_id===project.rentman_project_id):undefined;
  let status:ProjectCheck['status']='unverified',note='Controleer de uren en bedragen met de originele PDF.';
  if(!project){status='unknown_project';note='Dit projectnummer is nog niet gekoppeld aan een Rentman-project.';}
  else if(!assignmentsForProject.length){status='missing_assignment';note='Geen ingeroosterde diensten voor dit crewlid op dit project.';}
  else if(actualReports.length<assignmentsForProject.length){status='missing_report';note='Er ontbreken '+(assignmentsForProject.length-actualReports.length)+' shiftrapport(en). Geplande uren zijn geen bewijs van gewerkte uren.';}
  else if((hoursDiff!==null&&Math.abs(hoursDiff)>0.05)||(travelDiff!==null&&Math.abs(travelDiff)>0.05)||(expensesDiff!==null&&Math.abs(expensesDiff)>0.01)){
   status='difference';note='De opgegeven uren of onkosten verschillen van de ingediende shiftrapporten.';
  }else if(hoursDiff!==null&&travelDiff!==null&&expensesDiff!==null){
   status='match';note='Gewerkte uren, reistijd en onkosten komen overeen met de shiftrapporten. Uurtarief en factuurtotaal moeten nog afzonderlijk worden gecontroleerd.';
  }else if(hoursDiff!==null&&Math.abs(hoursDiff)<=0.05){
   status='unverified';note='Gewerkte uren komen overeen. Reistijd, onkosten en factuurtotaal zijn niet volledig vergelijkbaar.';
  }else{note='Shiftrapporten gevonden, maar de factuur bevat geen betrouwbaar herkenbaar urentotaal.';}
  checks.push({
   projectNumber:n,projectId:project?.rentman_project_id??null,projectName:project?.project_name??null,
   status,plannedShifts:assignmentsForProject.length,submittedShifts:actualReports.length,
   plannedHours:planned,reportedHours:worked,invoicedHours:invoiceHours,differenceHours:hoursDiff,
   reportedTravelHours:travel,invoicedTravelHours:travelClaim,travelDifferenceHours:travelDiff,
   reportedExpenses:expenses,invoicedExpenses:expensesClaim,expensesDifference:expensesDiff,
   billingStatus:queueItem?.status??null,billingItemId:queueItem?.id??null,note
  });
 }
 const status=checks.some(c=>c.status==='difference'||c.status==='missing_assignment')?'difference':
  checks.some(c=>c.status==='missing_report')?'missing_report':
  checks.length>0&&checks.every(c=>c.status==='match')?'match':'unverified';
 return {status,projects:checks};
}

/** Only submitted shift-report hours determine whether a crew invoice can be approved.
 * This check does not read outgoing customer billings or their charge rates.
 */
export function crewInvoiceHoursBlockReason(check:InvoiceCheck):string|null{
 if(!check.projects.length)return 'Koppel het project en vul de factuururen in voor de shiftrapportcontrole.';
 for(const p of check.projects){
  if(p.projectId===null||p.status==='unknown_project')
   return 'Project #'+p.projectNumber+' is niet gekoppeld aan Rentman.';
  if(p.status==='missing_assignment'||p.plannedShifts===0)
   return 'Er zijn geen gekoppelde diensten voor project #'+p.projectNumber+'.';
  if(p.submittedShifts===0||p.submittedShifts<p.plannedShifts)
   return 'Er ontbreken nog ingediende shiftrapporten voor project #'+p.projectNumber+'.';
  if(p.invoicedHours===null||p.differenceHours===null)
   return 'Vul de factuururen voor project #'+p.projectNumber+' in voordat je de factuur goedkeurt.';
  if(Math.abs(p.differenceHours)>0.05)
   return 'De factuururen voor #'+p.projectNumber+' wijken af van het shiftrapport ('+
    p.invoicedHours+' uur tegenover '+p.reportedHours+' uur). Vraag een correctie aan.';
 }
 return null;
}
