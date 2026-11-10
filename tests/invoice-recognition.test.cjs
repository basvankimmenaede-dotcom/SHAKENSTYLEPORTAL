const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

function loadTypeScriptModule(file){
 const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exported={};
 const context={module:{exports:exported},exports:exported,require:(name)=>{
  if(name==='server-only')return {};
  return require(name);
 },console,Buffer,Date,Set,Map,Number,String};
 vm.runInNewContext(output,context,{filename:file});
 return context.module.exports;
}
const {recognizeInvoiceText,readInvoicePdfText}=loadTypeScriptModule('src/lib/local-invoice-reader.ts');
const {findCrewInvoiceMatch}=loadTypeScriptModule('src/lib/crew-invoice-matching.ts');

test('Dutch invoice 99, EU date and VAT-inclusive amount',()=>{
 const result=recognizeInvoiceText(
 'Messina Events & Entertainment\nFactuur nr. 99\nFactuurdatum: 26-10-2026\nSubtotaal: € 1.289,26\nBTW 21%: € 270,74\nTotaal incl. BTW: € 1.560,00',
 'Invoice 99 Rode Hoed.pdf');
 assert.equal(result.invoice_number,'99');
 assert.equal(result.invoice_date,'2026-10-26');
 assert.equal(result.total_amount,1560);
});
test('English invoice number and US currency',()=>{
 const result=recognizeInvoiceText('Invoice No. INV-99\nInvoice date: 2026-10-26\nTOTAL DUE: €1,560.00','Invoice.pdf');
 assert.equal(result.invoice_number,'INV-99');
 assert.equal(result.invoice_date,'2026-10-26');
 assert.equal(result.total_amount,1560);
});
test('Never use subtotal or VAT as the invoice amount',()=>{
 const result=recognizeInvoiceText('Invoice 144\nDate 10/11/2026\nSubtotal €200\nBTW 21% €42\nTotal €242','invoice144.pdf');
 assert.equal(result.invoice_number,'144');
 assert.equal(result.total_amount,242);
});
test('Invalid dates are not accepted',()=>{
 const result=recognizeInvoiceText('Factuur: 10\nFactuurdatum: 31-02-2026\nTotaal € 50,00','Factuur.pdf');
 assert.equal(result.invoice_number,'10');
 assert.equal(result.invoice_date,null);
});
test('No total is better than guessing from a percentage',()=>{
 const result=recognizeInvoiceText('Factuur: 10\nBTW 21%\nSubtotaal € 80,00','Factuur.pdf');
 assert.equal(result.total_amount,null);
});
test('Company plus supplier email gives a strong suggestion, not an automatic link',()=>{
 const crew=[{id:'crew-1',full_name:'Luca Messina',company_name:'Messina Events & Entertainment',
  company_alias:null,invoice_email:'luca@example.com',email:'luca@example.com',rentman_email:null,login_email_override:null}];
 const result=findCrewInvoiceMatch({
  supplierName:null,supplierEmail:'luca@example.com',detectedEmails:['luca@example.com'],
  documentText:'Messina Events & Entertainment\nInvoice 99\n',
 },crew);
 assert.equal(result.suggestedCrewMemberId,'crew-1');
 assert.equal(result.strength,'strong');
});
test('Contradictory supplier and company evidence blocks a strong match',()=>{
 const crew=[
  {id:'crew-1',full_name:'Luca',company_name:'Messina Events',company_alias:null,invoice_email:'luca@example.com',email:null,rentman_email:null,login_email_override:null},
  {id:'crew-2',full_name:'Iris',company_name:'Iris Productions',company_alias:null,invoice_email:'iris@example.com',email:null,rentman_email:null,login_email_override:null}
 ];
 const result=findCrewInvoiceMatch({
  supplierName:'Messina Events',supplierEmail:'iris@example.com',detectedEmails:['iris@example.com']
 },crew);
 assert.equal(result.suggestedCrewMemberId,null);
 assert.equal(result.strength,'ambiguous');
});

function makePdf(){
 const text='BT /F1 13 Tf 55 745 Td (Invoice No. 99) Tj 0 -24 Td (Invoice date: 2026-10-26) Tj 0 -24 Td (Total 195.00) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream'
 ];
 let pdf='%PDF-1.4\n';
 const offsets=[0];
 for(let i=0;i<objects.length;i++){
  offsets.push(Buffer.byteLength(pdf));
  pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
 }
 const xref=Buffer.byteLength(pdf);
 pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const off of offsets.slice(1))pdf+=String(off).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return Buffer.from(pdf);
}
test('pdf-parse extracts text on the Node server without DOMMatrix crashes',async()=>{
 const pdf=makePdf();
 const text=await readInvoicePdfText(pdf);
 assert.match(text,/Invoice No\. 99/);
 assert.match(text,/2026-10-26/);
});

test('A VAT percentage next to a total label is not treated as an amount',()=>{
 const result=recognizeInvoiceText('Invoice 44\nTotaal inclusief btw 21%\nBTW 21%','Invoice 44.pdf');
 assert.equal(result.total_amount,null);
});

const {recognizeInvoiceProjects}=loadTypeScriptModule('src/lib/invoice-project-recognition.ts');
const {compareInvoiceToShiftReports,getInvoiceApprovalBlockReason}=loadTypeScriptModule('src/lib/invoice-shift-comparison.ts');
test('Invoice 99 contains project 11057, not invoice number as project',()=>{
 const parsed=recognizeInvoiceProjects('Invoice 99\nFactuurdatum 26-10-2026\nTotaal € 1560,00',
  'Invoice 99 11057 TML Rode Hoed.pdf',['11057','11077']);
 assert.equal(parsed.numbers.join(','),'11057');
 assert.equal(parsed.lines[0].work_hours,null);
});
test('Explicit project number and worked hours are recognized',()=>{
 const parsed=recognizeInvoiceProjects('Projectnummer: 11057\nTotaal gewerkte uren: 35,5 uur\nReistijd 2 uur\nOnkosten € 16,50',
  'invoice.pdf',['11057']);
 assert.equal(parsed.lines[0].work_hours,35.5);
 assert.equal(parsed.lines[0].travel_hours,2);
 assert.equal(parsed.lines[0].expenses_amount,16.5);
});
test('Random five-digit invoice numbers are not assumed to be projects',()=>{
 const parsed=recognizeInvoiceProjects('Factuurnummer 12345\nFactuurdatum 21-10-2026','invoice.pdf',['11057']);
 assert.equal(parsed.numbers.length,0);
});
test('Missing reports remain missing, even when planned hours equal invoice hours',()=>{
 const result=compareInvoiceToShiftReports({
  crewMemberId:'luca',projectNumbers:['11057'],
  projectLines:[{project_number:'11057',work_hours:8,travel_hours:null,expenses_amount:null,source:'manual',evidence:null}],
  catalog:[{rentman_project_id:3578,project_number:'11057',project_name:'TML ADE'}],
  assignments:[{id:'a1',crew_member_id:'luca',rentman_project_id:3578,starts_at:'2026-10-21T08:00:00Z',ends_at:'2026-10-21T16:00:00Z'}],
  reports:[],billing:[]
 });
 assert.equal(result.status,'missing_report');
 assert.equal(result.projects[0].reportedHours,0);
 assert.equal(result.projects[0].plannedHours,8);
});
test('A reported-hours difference is calculated per project',()=>{
 const result=compareInvoiceToShiftReports({
  crewMemberId:'luca',projectNumbers:['11057'],
  projectLines:[{project_number:'11057',work_hours:8,travel_hours:null,expenses_amount:null,source:'manual',evidence:null}],
  catalog:[{rentman_project_id:3578,project_number:'11057',project_name:'TML ADE'}],
  assignments:[{id:'a1',crew_member_id:'luca',rentman_project_id:3578,starts_at:'2026-10-21T08:00:00Z',ends_at:'2026-10-21T16:00:00Z'}],
  reports:[{assignment_id:'a1',work_started_at:'2026-10-21T08:00:00Z',work_ended_at:'2026-10-21T17:00:00Z',break_minutes:30,travel_minutes:0,expenses_amount:0,status:'submitted'}],
  billing:[{rentman_project_id:3578,status:'open',id:'billing1'}]
 });
 assert.equal(result.status,'difference');
 assert.equal(result.projects[0].reportedHours,8.5);
 assert.equal(result.projects[0].differenceHours,-0.5);
 assert.equal(result.projects[0].billingStatus,'open');
});
test('Actual work hours match but absent travel and expenses claims remain unverified',()=>{
 const result=compareInvoiceToShiftReports({
  crewMemberId:'luca',projectNumbers:['11057'],
  projectLines:[{project_number:'11057',work_hours:8,travel_hours:null,expenses_amount:null,source:'manual',evidence:null}],
  catalog:[{rentman_project_id:3578,project_number:'11057',project_name:'TML ADE'}],
  assignments:[{id:'a1',crew_member_id:'luca',rentman_project_id:3578,starts_at:'2026-10-21T08:00:00Z',ends_at:'2026-10-21T16:00:00Z'}],
  reports:[{assignment_id:'a1',work_started_at:'2026-10-21T08:00:00Z',work_ended_at:'2026-10-21T16:00:00Z',break_minutes:0,travel_minutes:0,expenses_amount:0,status:'submitted'}],
  billing:[]
 });
 assert.equal(result.status,'unverified');
});
test('Full work, travel and expenses match is allowed only with submitted reports',()=>{
 const result=compareInvoiceToShiftReports({
  crewMemberId:'luca',projectNumbers:['11057'],
  projectLines:[{project_number:'11057',work_hours:8,travel_hours:1,expenses_amount:3,source:'manual',evidence:null}],
  catalog:[{rentman_project_id:3578,project_number:'11057',project_name:'TML ADE'}],
  assignments:[{id:'a1',crew_member_id:'luca',rentman_project_id:3578,starts_at:'2026-10-21T08:00:00Z',ends_at:'2026-10-21T16:00:00Z'}],
  reports:[{assignment_id:'a1',work_started_at:'2026-10-21T08:00:00Z',work_ended_at:'2026-10-21T16:00:00Z',break_minutes:0,travel_minutes:60,expenses_amount:3,status:'submitted'}],
  billing:[]
 });
 assert.equal(result.status,'match');
});

test('Invoice approval is blocked for mismatches, missing reports and incomplete evidence',()=>{
 assert.match(getInvoiceApprovalBlockReason({status:'unverified',projects:[]}),/projectnummer/i);
 assert.match(getInvoiceApprovalBlockReason({status:'difference',projects:[{status:'difference'}]}),/wijkt af/i);
 assert.match(getInvoiceApprovalBlockReason({status:'missing_report',projects:[{status:'missing_report'}]}),/shiftrapporten/i);
 assert.match(getInvoiceApprovalBlockReason({status:'unverified',projects:[{status:'unverified'}]}),/vergelijking/i);
 assert.match(getInvoiceApprovalBlockReason({status:'difference',projects:[{status:'unknown_project'}]}),/onbekend/i);
});
test('An approved shift report counts as evidence for a complete invoice match',()=>{
 const check=compareInvoiceToShiftReports({
  crewMemberId:'luca',projectNumbers:['11057'],
  projectLines:[{project_number:'11057',work_hours:8,travel_hours:0,expenses_amount:0,source:'manual',evidence:null}],
  catalog:[{rentman_project_id:3578,project_number:'11057',project_name:'TML ADE'}],
  assignments:[{id:'a1',crew_member_id:'luca',rentman_project_id:3578,starts_at:'2026-10-21T08:00:00Z',ends_at:'2026-10-21T16:00:00Z'}],
  reports:[{assignment_id:'a1',work_started_at:'2026-10-21T08:00:00Z',work_ended_at:'2026-10-21T16:00:00Z',break_minutes:0,travel_minutes:0,expenses_amount:0,status:'approved'}],
  billing:[]
 });
 assert.equal(check.status,'match');
 assert.equal(getInvoiceApprovalBlockReason(check),null);
});


// Representative, synthetic version of an invoice with a separate date line and
// a quantity/description table. No real customer or supplier personal data.
const tableInvoice=[
 'Example Hospitality dienstverlening','Voorbeeldstraat 25','2041BS Voorbeeld',
 'Btw-nummer: NL001234567B01','KVK-nummer: 12345678',
 "SHAKE 'N STYLE B.V.",'Factuurdatum:','09/11/2026','Vervaldatum: 23/11/2026',
 'Factuur: 2026110014','Aantal Beschrijving Bedrag excl. btw Bedrag incl. btw',
 '4 11071 | 29.10 | Cocktail Catering | Tuschinski 16.00-20.00 € 120,00 € 145,20',
 'Stuksprijs: € 30,00',
 '4.75 Theater 18.45-23.30 € 142,50 € 172,43',
 'Stuksprijs: € 30,00',
 '10.25 11060 | 07.11 | Catering | King of Reach 16.30-02.45 € 307,50 € 372,08',
 'Stuksprijs: € 30,00',
 'Totaalbedrag excl. btw € 570,00','Btw hoog (21.0%) € 119,71',
 'Totaalbedrag incl. btw € 689,71'
].join('\n');
test('Invoice date on the following PDF line is recognized, not the payment due date',()=>{
 const result=recognizeInvoiceText(tableInvoice,'invoice.pdf');
 assert.equal(result.invoice_number,'2026110014');
 assert.equal(result.invoice_date,'2026-11-09');
 assert.equal(result.supplier_name,'Example Hospitality dienstverlening');
 assert.equal(result.total_amount,689.71);
});
test('Verified quantity and clock ranges yield hours for each specific project',()=>{
 const parsed=recognizeInvoiceProjects(tableInvoice,'invoice.pdf',['11071','11060']);
 assert.equal(parsed.numbers.join(','),'11060,11071');
 assert.equal(parsed.lines.find(x=>x.project_number==='11071').work_hours,4);
 assert.equal(parsed.lines.find(x=>x.project_number==='11060').work_hours,10.25);
 assert.match(parsed.notes.join(' '),/4,75 uur.*Theater.*handmatig/i);
});
test('Unassigned invoice rows must not be silently allocated to a single project',()=>{
 const parsed=recognizeInvoiceProjects(tableInvoice.replace('10.25 11060 |','10.25 onbekend |'),'invoice.pdf',['11071']);
 assert.equal(parsed.numbers.join(','),'11071');
 assert.equal(parsed.lines[0].work_hours,4);
 assert.match(parsed.notes.join(' '),/10,25 uur.*onbekend/i);
});
test('Item quantities without corroborating clock times are not treated as work hours',()=>{
 const text='Aantal Beschrijving Bedrag\n4 11071 | Verhuur glazen € 20,00\nStuksprijs: € 5,00\nTotaalbedrag incl. btw € 24,20';
 const parsed=recognizeInvoiceProjects(text,'invoice.pdf',['11071']);
 assert.equal(parsed.lines[0].work_hours,null);
});
test('Duplicate confirmed project rows are summed but missing project rows stay separate',()=>{
 const text=tableInvoice.replace('4.75 Theater','4.75 11071 | Theater');
 const parsed=recognizeInvoiceProjects(text,'invoice.pdf',['11071','11060']);
 assert.equal(parsed.lines.find(x=>x.project_number==='11071').work_hours,8.75);
 assert.equal(parsed.notes.some(x=>/zonder bevestigd projectnummer/.test(x)),false);
});
