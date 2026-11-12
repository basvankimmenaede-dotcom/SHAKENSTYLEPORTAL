'use client';
import type {InvoiceCheck} from '@/lib/invoice-shift-comparison';
export const checkLabels={
 match:'Uren & kosten komen overeen',
 difference:'Afwijking gevonden',
 missing_report:'Shiftrapport ontbreekt',
 unverified:'Controle nodig'
};
const euro=(value:number)=>value.toLocaleString('nl-NL',{style:'currency',currency:'EUR'});
const hours=(value:number)=>value.toLocaleString('nl-NL',{maximumFractionDigits:2})+' u';
export default function InvoiceShiftComparison({comparison}:{comparison:InvoiceCheck}){
 if(!comparison.projects.length)return <div className="invoiceCompareEmpty">
  <strong>Projectnummer ontbreekt</strong>
  <span>De factuur heeft nog geen bevestigd projectnummer. Zonder projectnummer kunnen we de shiftrapporten niet vergelijken.</span>
 </div>;
 return <div className="invoiceComparison">
  <div className="invoiceComparisonTitle"><strong>Vergelijking met shiftrapporten</strong>
   <span className={'invoiceCompareTag '+comparison.status}>{checkLabels[comparison.status]}</span></div>
  {comparison.projects.map(item=><div className="invoiceComparisonProject" key={item.projectNumber}>
   <div className="invoiceComparisonProjectHead">
    <div><strong>#{item.projectNumber}{item.projectName?' · '+item.projectName:''}</strong>
      <small>{item.projectId===null?'Project nog niet gekoppeld':item.submittedShifts+' van '+item.plannedShifts+' shiftrapporten ontvangen'}</small></div>
    <span className={'invoiceCompareTag '+item.status}>
     {item.status==='match'?'Overeenkomst':item.status==='difference'?'Afwijking':
      item.status==='missing_report'?'Rapport ontbreekt':item.status==='missing_assignment'?'Geen diensten':
      item.status==='unknown_project'?'Onbekend project':'Nog controleren'}</span>
   </div>
   <div className="invoiceComparisonMetrics">
     <div><span>Factuururen</span><strong>{item.invoicedHours===null?'—':hours(item.invoicedHours)}</strong></div>
     <div><span>Shiftrapport</span><strong>{item.submittedShifts?hours(item.reportedHours):'—'}</strong></div>
     <div><span>Verschil uren</span><strong className={item.differenceHours!==null&&Math.abs(item.differenceHours)>0.05?'difference':''}>
       {item.differenceHours===null?'—':(item.differenceHours>0?'+':'')+hours(item.differenceHours)}</strong></div>
     <div><span>Geplande uren (info)</span><strong>{item.plannedShifts?hours(item.plannedHours):'—'}</strong></div>
   </div>
   {(item.invoicedTravelHours!==null||item.invoicedExpenses!==null)&&<div className="invoiceCompareExtras">
     {item.invoicedTravelHours!==null?<span>Reistijd: factuur {hours(item.invoicedTravelHours)} / rapport {hours(item.reportedTravelHours)}
      {item.travelDifferenceHours!==null&&Math.abs(item.travelDifferenceHours)>0.05?' · verschil '+hours(item.travelDifferenceHours):''}</span>:null}
     {item.invoicedExpenses!==null?<span>Onkosten: factuur {euro(item.invoicedExpenses)} / rapport {euro(item.reportedExpenses)}
      {item.expensesDifference!==null&&Math.abs(item.expensesDifference)>0.01?' · verschil '+euro(item.expensesDifference):''}</span>:null}
   </div>}
   <p className="invoiceCompareNote">{item.note}</p>
   <p className="invoiceComparisonNote">Controle van de ontvangen bartenderfactuur tegenover het shiftrapport; onafhankelijk van de uitgaande klantfacturatie.</p>
  </div>)}
  <p className="invoiceComparisonDisclaimer">Uurtarieven en het volledige factuurtotaal worden nog niet automatisch geverifieerd. De controle vergelijkt alleen daadwerkelijk beschikbare gegevens.</p>
 </div>;
}
