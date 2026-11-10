import 'server-only';
import type {ParsedGoogleInvoice} from '@/lib/google-document-ai';

const emailPattern=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const months:Record<string,number>={
 januari:1,februari:2,maart:3,april:4,mei:5,juni:6,juli:7,augustus:8,september:9,
 oktober:10,november:11,december:12,
 january:1,february:2,march:3,may:5,june:6,july:7,august:8,october:10
};
const numericDate=/\b(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\b|\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/;
const namedDate=/\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|january|february|march|may|june|july|august|october|december)\s+(20\d{2})\b/i;
function isoDate(raw:string):string|null{
 const match=raw.match(numericDate);
 let y:number,m:number,d:number;
 if(match){
  if(match[1]){y=Number(match[1]);m=Number(match[2]);d=Number(match[3]);}
  else{y=Number(match[6]);m=Number(match[5]);d=Number(match[4]);}
 }else{
  const named=raw.match(namedDate);
  if(!named)return null;
  y=Number(named[3]);m=months[named[2].toLowerCase()];d=Number(named[1]);
 }
 if(!m||m<1||m>12||!d||d>31)return null;
 const date=new Date(Date.UTC(y,m-1,d));
 const out=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 return date.toISOString().slice(0,10)===out?out:null;
}
function euroValue(raw:string):number|null{
 const value=raw.replace(/[^\d,.-]/g,'').replace(/^-+/,'-');
 if(!value||value==='-'||value.length>22)return null;
 const comma=value.lastIndexOf(','),dot=value.lastIndexOf('.');
 const decimalIndex=Math.max(comma,dot);
 let clean=value;
 if(decimalIndex>=0){
  const digitsAfter=value.length-decimalIndex-1;
  if(digitsAfter===2||digitsAfter===1)clean=value.slice(0,decimalIndex).replace(/[.,]/g,'')+'.'+value.slice(decimalIndex+1);
  else clean=value.replace(/[.,]/g,'');
 }
 const parsed=Number(clean);
 return Number.isFinite(parsed)&&parsed>=0&&parsed<1e8?Math.round(parsed*100)/100:null;
}
function priceOnLine(line:string):number|null{
 // Ignore accidental numerals elsewhere in a PDF; only use totals in explicitly labelled rows.
 const fragments=[...line.matchAll(/(?:€\s*)?\b\d{1,8}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\b\s*€?/g)]
  .map(match=>({raw:match[0],value:euroValue(match[0])})).filter(x=>x.value!==null);
 return fragments.length?fragments[fragments.length-1].value:null;
}
type Field={value:string;confidence:number};
export type LocalParsedInvoice=ParsedGoogleInvoice;
const invoiceLabel=/(?:\b(?:factuurnummer|factuurnr\.?|factuurno\.?|factuur\s*nr\.?|factuur\s*no\.?|invoice\s*(?:number|no\.?|nr\.?|id|#)?|invoice[#:]|factuur[#:]|nota\s*nr\.?)\b)\s*(?:nr\.?|no\.?|#|:|-)?\s*([A-Za-z0-9][A-Za-z0-9_./-]{0,63})/i;
function invoiceNo(lines:string[],filename:string):{value:string|null;confidence:number}{
 for(const line of lines){
  const match=line.match(invoiceLabel);
  if(!match)continue;
  const value=match[1].replace(/[.;,]$/,'');
  if(!/^(?:datum|date|nr|nummer|number|no|bedrag|total|totaal|btw|incl|excl|van|voor|de)$/i.test(value))
   return {value,confidence:0.9};
 }
 const fromFilename=filename.match(/(?:factuur|invoice|inv)[\s_-]*(?:nr\.?|no\.?|#)?\s*([A-Za-z0-9][A-Za-z0-9_./-]{0,63})/i);
 return {value:fromFilename?.[1]?.replace(/[.,;]$/,'')||null,confidence:fromFilename?0.54:0};
}
function invoiceDate(lines:string[]):{value:string|null;confidence:number}{
 const labeled=lines.filter(line=>/(?:factuurdatum|invoice\s*date|datum\s*factuur|datum\s*uitgifte|issue\s*date)/i.test(line));
 for(const line of labeled){
  const date=isoDate(line);
  if(date)return {value:date,confidence:0.92};
 }
 for(const line of lines.slice(0,55)){
  if(/(?:vervaldatum|due\s*date|betaal\s*voor|payment\s*date|leverdatum)/i.test(line))continue;
  if(!/\bdatum\b|\bdate\b/i.test(line))continue;
  const date=isoDate(line);
  if(date)return {value:date,confidence:0.75};
 }
 return {value:null,confidence:0};
}
function invoiceAmount(lines:string[]):{value:number|null;confidence:number}{
 const strong=/(?:totaal\s*te\s*betalen|totaal(?:bedrag)?\s*(?:incl\.?\s*(?:btw)?|inclusief|verschuldigd|factuur)|total\s*(?:amount\s*)?due|amount\s*due|grand\s*total|netto\s*te\s*betalen|te\s*betalen|eindbedrag|total\s*(?:incl|payable)|factuurbedrag)/i;
 for(const line of lines){
  if(/(?:subtotaal|subtotal|totaal\s*excl|total\s*excl|tegoed|korting)/i.test(line))continue;
  if(!strong.test(line))continue;
  const value=priceOnLine(line);
  if(value!==null)return {value,confidence:0.91};
 }
 // "Totaal" without an amount is not enough to guess which value is the invoice total.
 for(const line of lines){
  if(!/^(?:totaal|total|saldo|verschuldigd)(?:\s*[:€])?/i.test(line)||/excl|subtotaal|subtotal/i.test(line))continue;
  const value=priceOnLine(line.replace(/^(?:totaal|total|saldo|verschuldigd)/i,''));
  if(value!==null)return {value,confidence:0.72};
 }
 return {value:null,confidence:0};
}
function supplierFromLines(lines:string[]):{value:string|null;confidence:number}{
 // Explicit vendor labels are preferred. A generic header line is not treated as a trusted supplier.
 const labeled=/(?:leverancier|afzender|supplier|vendor|verkoper|uitgegeven\s*door|issued\s*by|from)\s*[:\-]\s*(.+)$/i;
 for(const line of lines.slice(0,60)){
  const named=line.match(labeled)?.[1]?.trim();
  if(named&&named.length>=4&&named.length<=140&&!/^SHAKENSTYLE\b/i.test(named))
   return {value:named,confidence:0.8};
 }
 return {value:null,confidence:0};
}
function supplierEmail(lines:string[]):{value:string|null;confidence:number}{
 // Do not confuse a recipient address on a forwarded invoice with the vendor's address.
 for(const line of lines.slice(0,65)){
  if(!/(?:leverancier|vendor|supplier|afzender|from|bedrijfsgegevens)/i.test(line))continue;
  const email=line.match(emailPattern)?.[0];
  if(email)return {value:email.toLowerCase(),confidence:0.8};
 }
 return {value:null,confidence:0};
}
export function recognizeInvoiceText(rawText:string,filename:string):LocalParsedInvoice{
 const text=rawText.slice(0,65000).replace(/[\u00a0\u202f]/g,' ').normalize('NFKC');
 const lines=text.split(/\r?\n/).map(line=>line.trim().replace(/[ \t]+/g,' ')).filter(Boolean).slice(0,1200);
 const number=invoiceNo(lines,filename),date=invoiceDate(lines),amount=invoiceAmount(lines),
  vendor=supplierFromLines(lines),vendorEmail=supplierEmail(lines);
 const detected=[...new Set((text.match(emailPattern)||[]).map(x=>x.toLowerCase()))].slice(0,40);
 const fields:Record<string,Field>={};
 if(number.value)fields.invoice_id={value:number.value,confidence:number.confidence};
 if(date.value)fields.invoice_date={value:date.value,confidence:date.confidence};
 if(amount.value!==null)fields.total_amount={value:String(amount.value),confidence:amount.confidence};
 if(vendor.value)fields.supplier_name={value:vendor.value,confidence:vendor.confidence};
 if(vendorEmail.value)fields.supplier_email={value:vendorEmail.value,confidence:vendorEmail.confidence};
 return {
  invoice_number:number.value,invoice_date:date.value,total_amount:amount.value,
  supplier_name:vendor.value,supplier_email:vendorEmail.value,detected_emails:detected,
  raw_text:text.slice(0,20000),ai_fields:fields,ai_confidence:null
 };
}
export async function readInvoicePdfText(content:Buffer):Promise<string>{
 if(content.length>15*1024*1024||content.subarray(0,5).toString('ascii')!=='%PDF-')
  throw new Error('Dit bestand is geen geldige PDF van maximaal 15 MB.');
 // pdf-parse/worker must load first on Node/Vercel to supply DOMMatrix via the canvas factory.
 const {CanvasFactory,getPath}=await import('pdf-parse/worker');
 const {PDFParse}=await import('pdf-parse');
 PDFParse.setWorker(getPath());
 const parser=new PDFParse({data:new Uint8Array(content),CanvasFactory});
 try{
  const response=await parser.getText();
  const text=String(response.text||'');
  if(text.trim().length<25)
   throw new Error('Dit lijkt een gescande PDF zonder tekst. Gebruik Google Document AI of vul de factuur handmatig in.');
  return text;
 }finally{
  await parser.destroy().catch(()=>undefined);
 }
}
