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
  throw new Error('Unexpected runtime dependency '+name);
 },console,Buffer,Date,Set,Map,Number,String};
 vm.runInNewContext(output,context,{filename:file});
 return context.module.exports;
}
const {recognizeInvoiceText}=loadTypeScriptModule('src/lib/local-invoice-reader.ts');
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
