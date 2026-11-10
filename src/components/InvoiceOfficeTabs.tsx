import Link from 'next/link';
import {Archive,ClipboardCheck,AlertTriangle} from 'lucide-react';
export type InvoiceTab='open'|'differences'|'archive';
const entries=[
 {key:'open',label:'Te controleren',icon:ClipboardCheck},
 {key:'differences',label:'Afwijkingen',icon:AlertTriangle},
 {key:'archive',label:'Archief',icon:Archive}
] as const;
export default function InvoiceOfficeTabs({active,counts}:{active:InvoiceTab;counts:{open:number;archive:number;differences:number}}){
 return <nav className="invoiceOfficeTabs" aria-label="Factuuroverzicht">
  {entries.map(entry=>{
   const Icon=entry.icon;
   return <Link href={'/planning/crew-invoices?view='+entry.key} key={entry.key}
    className={'invoiceOfficeTab '+(active===entry.key?'active':'')}>
    <Icon size={17}/><span>{entry.label}</span>
    {entry.key==='open'&&<strong>{counts.open}</strong>}
    {entry.key==='archive'&&<strong>{counts.archive}</strong>}
    {entry.key==='differences'&&counts.differences>0&&<strong>{counts.differences}</strong>}
   </Link>;
  })}
 </nav>;
}
