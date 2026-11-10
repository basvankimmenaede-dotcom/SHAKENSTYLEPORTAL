/**
 * Pure, deterministic project recognition. Project IDs and invoice numbers are distinct.
 * Never treat arbitrary 5-digit numbers as projects without an explicit label or a catalog match.
 */
export type InvoiceProjectLine={
 project_number:string;
 work_hours:number|null;
 travel_hours:number|null;
 expenses_amount:number|null;
 source:'pdf_text'|'manual';
 evidence:string|null;
};
export type ProjectReferenceResult={numbers:string[];lines:InvoiceProjectLine[];notes:string[]};
const numberPattern=/^[0-9]{4,8}$/;
const projectLabel=/\b(?:project(?:nummer|nr|no|number)?|project[\s-]*(?:nummer|nr|no|number)|opdracht(?:nummer|nr)?|job[\s-]*(?:number|no))\s*[#:.\-]?\s*(\d{4,8})\b/ig;
const hoursPattern=/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:uur|uren|hours?|hrs?)\b/ig;
const travelPattern=/\b(?:reistijd|reisuren|travel(?:\s*time)?|travel\s*hours?)\s*(?::|=|-)?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(uur|uren|hours?|hrs?|min(?:uten|utes)?|m)\b/i;
function asHours(token:string){const value=Number(token.replace(',','.'));return Number.isFinite(value)&&value>=0&&value<=500?value:null;}
function round(value:number){return Math.round(value*100)/100;}
function inText(text:string,number:string){
 const re=new RegExp('(^|[^0-9])'+number+'([^0-9]|$)','g');
 return re.test(text);
}
function lineHours(line:string,travel=false){
 if(!travel&&/\b(?:reistijd|reisuren|travel|tarief|uurtarief|rate|btw|vat)\b/i.test(line))return null;
 let match:RegExpExecArray|null,hours:number|null=null;
 hoursPattern.lastIndex=0;
 while((match=hoursPattern.exec(line))){
  const h=asHours(match[1]);
  if(h!==null)hours=h;
 }
 return hours;
}
function findWorkHours(lines:string[],index:number,end:number){
 const block=lines.slice(index,Math.min(end,index+18));
 for(const row of block){
  if(!/\b(?:totaal\s*uren|totaal\s*gewerkt|total\s*hours|gewerkte\s*uren|worked\s*hours)\b/i.test(row))continue;
  const found=lineHours(row);
  if(found!==null)return found;
 }
 let hours=0,matched=0;
 for(const row of block){
  const amount=lineHours(row);
  if(amount===null)continue;
  // Use independent dated rows or explicit worked-hours lines, not a full-text search.
  if(!/\b(?:uren?|gewerkt|worked|hours?|hrs?)\b/i.test(row))continue;
  hours+=amount;matched++;
 }
 return matched>0?round(hours):null;
}
function findTravelHours(lines:string[],index:number,end:number){
 const block=lines.slice(index,Math.min(end,index+18));
 let hours=0,count=0;
 for(const row of block){
  const match=row.match(travelPattern);
  if(!match)continue;
  const amount=asHours(match[1]);
  if(amount===null)continue;
  hours+=/\bmin/i.test(match[2])?amount/60:amount;count++;
 }
 return count?round(hours):null;
}
function parseExpense(line:string):number|null{
 const match=line.match(/\b(?:onkosten|extra\s*kosten|expenses?|parking|parkeerkosten)\b[^\n]{0,65}?[€]\s*(\d[\d.,]*)/i);
 if(!match)return null;
 const raw=match[1];
 const last=Math.max(raw.lastIndexOf(','),raw.lastIndexOf('.'));
 const value=last>=0&&raw.length-last-1<=2
  ?Number(raw.slice(0,last).replace(/[.,]/g,'')+'.'+raw.slice(last+1))
  :Number(raw.replace(/[.,]/g,''));
 return Number.isFinite(value)&&value>=0&&value<100000?round(value):null;
}

type InvoicedHourRow={line:number;hours:number;projectNumber:string|null;description:string};
const quantityPattern=/^(\d{1,3}(?:[.,]\d{1,2})?)\s+(.+)$/;
const unitPricePattern=/\b(?:stuksprijs|unit\s*price|prijs\s*per\s*(?:uur|stuk)|uurtarief)\b/i;
const timeRangePattern=/(?:^|[^\d])([01]?\d|2[0-3])[.:]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[.:]([0-5]\d)(?!\d)/;
/**
 * Recognize billed *hours*, not arbitrary item quantities: the table must contain an
 * explicit quantity, a unit price and a clock range confirming that quantity.
 * Rows without a verified project number are intentionally left unassigned.
 */
function findInvoicedHourRows(lines:string[],confirmedProjects:string[]):InvoicedHourRow[]{
 const header=lines.findIndex((row,i)=>/\baantal\b/i.test(row)
  &&lines.slice(i,i+3).some(value=>/\bbeschrijving\b/i.test(value)));
 if(header<0)return [];
 const total=lines.findIndex((row,i)=>i>header
  &&/\b(?:totaalbedrag|subtotal|grand\s*total|btw\s+hoog)\b/i.test(row));
 const end=total>header?total:Math.min(lines.length,header+150);
 const verified=new Set(confirmedProjects);
 const found:InvoicedHourRow[]=[];
 for(let i=header+1;i<end;i++){
  const match=lines[i].match(quantityPattern);
  if(!match)continue;
  const hours=asHours(match[1]);
  if(hours===null||hours<=0||hours>24)continue;
  if(!lines.slice(i+1,Math.min(i+4,end)).some(value=>unitPricePattern.test(value)))continue;
  const description=match[2].replace(/\s*€.*$/,'').trim();
  const range=description.match(timeRangePattern);
  if(!range)continue;
  const start=Number(range[1])*60+Number(range[2]);
  const finish=Number(range[3])*60+Number(range[4]);
  const clockHours=((finish-start+1440)%1440)/60;
  if(Math.abs(clockHours-hours)>0.05)continue;
  const ref=description.match(/^\s*(?:project(?:nummer)?\s*[:#-]?\s*)?(\d{4,8})(?=\s*(?:[|:;\-]|$))/i)?.[1];
  found.push({line:i,hours,projectNumber:ref&&verified.has(ref)?ref:null,description:description.slice(0,180)});
 }
 return found;
}

/**
 * A catalog match is only a suggestion: office must confirm project refs before linking.
 * No available catalog means only explicitly labelled numbers can be recognized.
 */
export function recognizeInvoiceProjects(text:string,filename:string,knownNumbers:string[]):ProjectReferenceResult{
 const raw=(text||'').slice(0,65000).normalize('NFKC');
 const lines=raw.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,1200);
 const source=[...lines.slice(0,300),String(filename||'')].join('\n');
 const numbers=new Set<string>();
 const notes:string[]=[];
 let match:RegExpExecArray|null;
 projectLabel.lastIndex=0;
 while((match=projectLabel.exec(source))&&numbers.size<15)numbers.add(match[1]);
 const known=[...new Set(knownNumbers.filter(n=>numberPattern.test(n)))].slice(0,4000);
 for(const n of known){
  if(numbers.size>=15)break;
  if(inText(source,n))numbers.add(n);
 }
 const sorted=[...numbers].sort((a,b)=>a.localeCompare(b,'nl'));
 const billedRows=findInvoicedHourRows(lines,sorted);
 const linesOut:InvoiceProjectLine[]=[];
 for(const n of sorted){
  const labeled=new RegExp('\\b(?:project(?:nummer|nr|no|number)?|opdracht(?:nummer|nr)?|job\\s*(?:number|no))\\s*[#:.\\-]?\\s*'+n+'\\b','i');
  const index=lines.findIndex(line=>labeled.test(line));
  const occurrences=lines.flatMap((line,i)=>inText(line,n)?[i]:[]);
  // Only the explicitly labelled project block can be trusted for quantitative claims.
  // For filename-only matches, hour totals remain unknown rather than guessed.
  const row=index>=0?index:occurrences.find(i=>i<110)??-1;
  let work_hours:number|null=null,travel_hours:number|null=null,expenses_amount:number|null=null,evidence:string|null=null;
  if(row>=0){
   const next=sorted.flatMap(other=>other===n?[]:
    lines.flatMap((line,i)=>i>row&&inText(line,other)?[i]:[])).sort((a,b)=>a-b)[0];
   const end=next??Math.min(lines.length,row+18);
   // If there is more than one project, only explicit project lines bound the block.
   if(sorted.length===1||index>=0){
    work_hours=findWorkHours(lines,row,end);
    travel_hours=findTravelHours(lines,row,end);
    const expenses=lines.slice(row,Math.min(end,row+18)).map(parseExpense).filter((v):v is number=>v!==null);
    expenses_amount=expenses.length?round(expenses.reduce((a,b)=>a+b,0)):null;
   }
   evidence=lines[row].slice(0,160);
  }
  // A verified table row and corroborating clock times are stronger than
  // a free-form 'hours' mention in a nearby, potentially unrelated paragraph.
  const billedForProject=billedRows.filter(item=>item.projectNumber===n);
  if(billedForProject.length){
   work_hours=round(billedForProject.reduce((sum,item)=>sum+item.hours,0));
   evidence=billedForProject.map(item=>item.description).join('; ').slice(0,160);
  }
  linesOut.push({project_number:n,work_hours,travel_hours,expenses_amount,source:'pdf_text',evidence});
 }
 const unassigned=billedRows.filter(item=>item.projectNumber===null);
 if(unassigned.length)notes.push('Factuurregel(s) zonder bevestigd projectnummer: '+
  unassigned.map(item=>String(item.hours).replace('.',',')+' uur – '+item.description).join('; ')+
  '. Wijs deze uren handmatig toe aan het juiste project voordat je koppelt.');
 if(sorted.length===0)notes.push('Geen projectnummer herkend. Controleer of het projectnummer op de PDF staat.');
 if(sorted.length>1)notes.push('Meerdere projectnummers gevonden. Controleer de uren per project voordat je koppelt.');
 if(sorted.some(n=>!known.includes(n)))notes.push('Een projectnummer staat nog niet in de projectcatalogus. Controleer de koppeling met Rentman.');
 return {numbers:sorted,lines:linesOut,notes};
}
