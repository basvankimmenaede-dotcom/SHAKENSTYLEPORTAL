import 'server-only';
import {createSign} from 'node:crypto';
import {decryptSecret} from '@/lib/invoice-imap';
import {getInvoiceProcessingSettings, type InvoiceProcessingSettings} from '@/lib/invoice-processing-settings';

type ServiceAccount={type:string;client_email:string;private_key:string;project_id?:string};
type Normalized={text?:string;dateValue?:{year?:number;month?:number;day?:number};moneyValue?:{currencyCode?:string;units?:string|number;nanos?:number}};
type Entity={type:string;mentionText?:string;confidence?:number;normalizedValue?:Normalized};
type Document={text?:string;entities?:Entity[]};
export type ParsedGoogleInvoice={
 invoice_number:string|null;invoice_date:string|null;total_amount:number|null;
 supplier_name:string|null;detected_emails:string[];raw_text:string;
 ai_fields:Record<string,{value:string;confidence:number|null}>;
 ai_confidence:number|null;
};
function account(settings:InvoiceProcessingSettings):ServiceAccount{
 if(!settings.google_service_account_encrypted)throw new Error('Google Document AI heeft nog geen serviceaccount. Voeg dit toe in Instellingen → Factuurverwerking.');
 const parsed=JSON.parse(decryptSecret(settings.google_service_account_encrypted)) as ServiceAccount;
 if(parsed.type!=='service_account'||!parsed.client_email?.endsWith('.gserviceaccount.com')||!parsed.private_key?.includes('BEGIN PRIVATE KEY'))
  throw new Error('Google serviceaccount is ongeldig.');
 return parsed;
}
export function documentAiConfigured(settings:InvoiceProcessingSettings){
 return Boolean(settings.google_project_id&&settings.google_processor_id&&settings.google_service_account_encrypted&&settings.google_tested_at);
}
function processorUrl(settings:InvoiceProcessingSettings){
 if(!/^[a-z][a-z0-9-]{3,62}$/.test(settings.google_project_id)
  ||!/^[a-z0-9]{8,40}$/i.test(settings.google_processor_id)
  ||!['eu','us'].includes(settings.google_location))throw new Error('Ongeldige Google Document AI processorinstellingen.');
 return 'https://'+settings.google_location+'-documentai.googleapis.com/v1/projects/'
  +encodeURIComponent(settings.google_project_id)+'/locations/'+settings.google_location+
  '/processors/'+encodeURIComponent(settings.google_processor_id);
}
async function accessToken(settings:InvoiceProcessingSettings){
 const service=account(settings);
 const now=Math.floor(Date.now()/1000);
 const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
 const claims=Buffer.from(JSON.stringify({iss:service.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',
  aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3300})).toString('base64url');
 const input=header+'.'+claims;
 const signer=createSign('RSA-SHA256');signer.update(input);signer.end();
 const signature=signer.sign(service.private_key).toString('base64url');
 const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+signature});
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body,signal:AbortSignal.timeout(14000),cache:'no-store'});
 if(!response.ok)throw new Error('Google kon het serviceaccount niet aanmelden ('+response.status+'). Controleer de sleutel en rechten.');
 const data=await response.json() as {access_token?:string};
 if(!data.access_token)throw new Error('Google gaf geen toegangstoken terug.');
 return data.access_token;
}
export async function testGoogleDocumentAi(settings:InvoiceProcessingSettings){
 const url=processorUrl(settings),token=await accessToken(settings);
 const response=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+token},
  signal:AbortSignal.timeout(14000),cache:'no-store'});
 if(!response.ok)throw new Error('Google Document AI processor niet bereikbaar ('+response.status+'). Controleer project, regio, ID en rechten.');
 const info=await response.json() as {type?:string;displayName?:string};
 if(info.type&&info.type!=='INVOICE_PROCESSOR')throw new Error('De gekozen Google processor is geen Invoice Parser.');
 return info.displayName||'Invoice Parser';
}
function pick(document:Document,type:string){return (document.entities||[]).filter(x=>x.type===type).sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0]}
function value(entity?:Entity){return entity?.normalizedValue?.text?.trim()||entity?.mentionText?.trim()||''}
function money(entity?:Entity){
 const n=entity?.normalizedValue?.moneyValue;
 if(n&&n.units!==undefined){const v=Number(n.units)+Number(n.nanos||0)/1e9;return Number.isFinite(v)&&v>=0?Math.round(v*100)/100:null;}
 const text=value(entity).replace(/[^\d.,-]/g,'');
 if(!text)return null;
 const comma=text.lastIndexOf(','),dot=text.lastIndexOf('.');
 const decimals=Math.max(comma,dot),fraction=text.slice(decimals+1);
 const numeric=decimals>=0&&fraction.length===2
  ?text.slice(0,decimals).replace(/[.,]/g,'')+'.'+fraction
  :text.replace(/[.,]/g,'');
 const num=Number(numeric);return Number.isFinite(num)&&num>=0&&num<100000000?num:null;
}
function date(entity?:Entity){
 const norm=entity?.normalizedValue?.dateValue;
 if(norm?.year&&norm?.month&&norm?.day){
  const y=norm.year,m=norm.month,d=norm.day;
  if(new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'))
   return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 }
 const raw=value(entity);
 const iso=raw.match(/^20\d{2}-\d{2}-\d{2}$/);
 if(iso)return iso[0];
 const parts=raw.match(/^(\d{1,2})[-./](\d{1,2})[-./](20\d{2})$/);
 if(parts){const [,d,m,y]=parts;const out=y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');if(!Number.isNaN(Date.parse(out)))return out;}
 return null;
}
export async function parseGoogleInvoicePdf(content:Buffer,settings=await getInvoiceProcessingSettings()):Promise<ParsedGoogleInvoice>{
 if(!documentAiConfigured(settings))throw new Error('Stel Google Document AI in en test de verbinding onder Instellingen → Factuurverwerking.');
 if(content.length>15*1024*1024||content.subarray(0,5).toString()!=='%PDF-')
  throw new Error('Deze bijlage is geen geldige PDF (maximaal 15 MB).');
 const token=await accessToken(settings);
 const response=await fetch(processorUrl(settings)+':process',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({rawDocument:{content:content.toString('base64'),mimeType:'application/pdf'},
   fieldMask:'text,entities',imagelessMode:true}),
  signal:AbortSignal.timeout(55000),cache:'no-store'
 });
 if(!response.ok)throw new Error('Google Document AI kon de factuur niet uitlezen ('+response.status+').');
 const body=await response.json() as {document?:Document};
 const document=body.document||{};
 const fields:Record<string,{value:string;confidence:number|null}>={};
 for(const e of document.entities||[]){
  if(e.type.startsWith('line_item'))continue;
  if(!fields[e.type]||(e.confidence||0)>(fields[e.type].confidence||0))
    fields[e.type]={value:value(e).slice(0,240),confidence:typeof e.confidence==='number'?e.confidence:null};
 }
 const number=value(pick(document,'invoice_id'))||null;
 const amount=money(pick(document,'total_amount'));
 const invoiceDate=date(pick(document,'invoice_date'));
 const supplierName=value(pick(document,'supplier_name'))||null;
 const emailText=value(pick(document,'supplier_email'));
 const detectedFromText=(document.text||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
 const allEmails=[...new Set([emailText,...detectedFromText].map(e=>e.trim().toLowerCase()).filter(Boolean))].slice(0,30);
 const required=['invoice_id','invoice_date','total_amount'];
 const confidence=required.map(type=>pick(document,type)?.confidence).filter((v):v is number=>typeof v==='number');
 return {invoice_number:number,invoice_date:invoiceDate,total_amount:amount,supplier_name:supplierName,
  detected_emails:allEmails,raw_text:(document.text||'').slice(0,20000),
  ai_fields:fields,ai_confidence:confidence.length?Math.min(...confidence):null};
}
