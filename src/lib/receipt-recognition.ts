/**
 * Lightweight, conservative suggestions for supermarket receipts.
 * Values are suggestions only: a person must verify the actual receipt before filing.
 * No external service receives the recognized text.
 */
export type ReceiptSuggestion={
 supplierName:string|null;
 date:string|null;
 total:number|null;
 receiptNumber:string|null;
 vatLines:string[];
};
const KNOWN_SHOPS:[RegExp,string][]=[
 [/\bALBERT\s+HEI(?:JN|N)\b|\bAH\s+TO\s+GO\b|^\s*AH\s*$/im,'Albert Heijn'],
 [/\bJUMBO\b/i,'Jumbo'],
 [/\bLIDL\b/i,'Lidl'],
 [/\bALDI\b/i,'Aldi'],
 [/\bPLUS\s+SUPERMARKT\b|^\s*PLUS\s*$/im,'PLUS'],
 [/\bHEMA\b/i,'HEMA'],
 [/\bKRUIDVAT\b/i,'Kruidvat'],
 [/\bETOS\b/i,'Etos'],
 [/\bHANOS\b/i,'Hanos'],
 [/\bMAKRO\b/i,'Makro'],
 [/\bDIRK\b/i,'Dirk'],
 [/\bHOOGVLIET\b/i,'Hoogvliet']
];
function isoDate(year:number,month:number,day:number):string|null{
 if(year<2020||year>2100||month<1||month>12||day<1||day>31)return null;
 const value=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
 const date=new Date(Date.UTC(year,month-1,day));
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
}
function dateInText(text:string):string|null{
 // yyyy-mm-dd or dd-mm-yyyy or dd-mm-yy, with slashes/dots also accepted.
 const pattern=/\b(?:(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})|(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2}|2\d))\b/g;
 for(const match of text.matchAll(pattern)){
  const year=match[1]?Number(match[1]):(Number(match[6])<100?2000+Number(match[6]):Number(match[6]));
  const month=Number(match[1]?match[2]:match[5]);
  const day=Number(match[1]?match[3]:match[4]);
  const date=isoDate(year,month,day);
  if(date)return date;
 }
 return null;
}
function euroValue(value:string):number|null{
 const cleaned=value.replace(/[^\d,.-]/g,'');
 if(!cleaned)return null;
 const decimal=cleaned.slice(-3,-2);
 if(decimal!==','&&decimal!=='.')return null;
 const integer=cleaned.slice(0,-3).replace(/[.,]/g,'');
 if(!/^\d+$/.test(integer)||!/\d{2}$/.test(cleaned))return null;
 const parsed=Number(integer)+Number(cleaned.slice(-2))/100;
 return Number.isFinite(parsed)&&parsed>=0&&parsed<99999999?Math.round(parsed*100)/100:null;
}
function amountsInLine(line:string):number[]{
 const matches=line.matchAll(/(?:€\s*)?(\d[\d.,\s]*[.,]\d{2})(?!\d)/g);
 const found:number[]=[];
 for(const m of matches){
  const amount=euroValue(m[1]);
  if(amount!==null)found.push(amount);
 }
 return found;
}
function totalFromLines(lines:string[]):number|null{
 let best:{score:number;value:number}|null=null;
 for(const line of lines){
  if(/\b(sub\s*totaal|korting|bonus|wisselgeld|terug|voordeel|besparing|spaarkaart|btw|tax)\b/i.test(line))continue;
  const values=amountsInLine(line);
  if(!values.length)continue;
  let score=0;
  if(/\b(te\s*betalen|totaal\s*te\s*betalen|total\s*due|bedrag\s*te\s*betalen|eindtotaal)\b/i.test(line))score=7;
  else if(/\b(totaal|total|totalen|totaalbedrag)\b/i.test(line))score=6;
  else if(/\b(betaald|pinbetaling|pin\s*bedrag)\b/i.test(line))score=4;
  else if(/^\s*pin\s*[€: ]/i.test(line))score=3;
  if(!score)continue;
  const value=values[values.length-1];
  if(!best||score>best.score)best={score,value};
 }
 return best?.value??null;
}
function receiptRef(text:string):string|null{
 const patterns=[
  /\b(?:bon\s*(?:nummer|nr\.?|no\.?)|bonnummer|kassabon\s*(?:nr\.?|nummer)|transactie\s*(?:nr\.?|nummer|id)|transactienr\.?|ticket\s*(?:no\.?|nr\.?)|receipt\s*(?:no\.?|number))\s*[:#-]?\s*([a-z0-9][a-z0-9/-]{2,22})/i
 ];
 for(const pattern of patterns){
  const match=text.match(pattern);
  if(match)return match[1].replace(/[^A-Za-z0-9-]/g,'').slice(0,24);
 }
 return null;
}
export function recognizeReceiptText(raw:string):ReceiptSuggestion{
 const text=raw.slice(0,20000);
 const shop=KNOWN_SHOPS.find(([regex])=>regex.test(text));
 const firstLines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,6);
 const fallback=firstLines.find(x=>/^[\p{L}][\p{L}\p{N} \-&.]{2,45}$/u.test(x)&&
  !/^(kassabon|factuur|ticket|www|totaal|datum|belasting|btw|welkom|bedankt)/i.test(x))||null;
 const lines=text.split(/\r?\n/);
 const vatLines=lines.filter(line=>/\b(?:BTW|VAT)\b/i.test(line)&&/(?:^|\s)(?:9|21|0)\s*%/.test(line)).slice(0,5);
 return {
  supplierName:shop?.[1]||fallback,
  date:dateInText(text),
  total:totalFromLines(lines),
  receiptNumber:receiptRef(text),
  vatLines:vatLines.map(x=>x.trim().slice(0,120))
 };
}
