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
  '<< /Length '+Buffer.byteLength(text)+' >>\\nstream\\n'+text+'\\nendstream'
 ];
 let pdf='%PDF-1.4\\n';
 const offsets=[0];
 for(let i=0;i<objects.length;i++){
  offsets.push(Buffer.byteLength(pdf));
  pdf+=(i+1)+' 0 obj\\n'+objects[i]+'\\nendobj\\n';
 }
 const xref=Buffer.byteLength(pdf);
 pdf+='xref\\n0 '+(objects.length+1)+'\\n0000000000 65535 f \\n';
 for(const off of offsets.slice(1))pdf+=String(off).padStart(10,'0')+' 00000 n \\n';
 pdf+='trailer\\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\\nstartxref\\n'+xref+'\\n%%EOF';
 return Buffer.from(pdf);
}
test('pdf-parse extracts text on the Node server without DOMMatrix crashes',async()=>{
 const pdf=makePdf();
 const text=await readInvoicePdfText(pdf);
 assert.match(text,/Invoice No\\. 99/);
 assert.match(text,/2026-10-26/);
});
