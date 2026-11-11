const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/receipt-recognition.ts'),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};
vm.runInNewContext(output,{module:m,exports:m.exports,require,Date,String,Number,RegExp,console});
const {recognizeReceiptText}=m.exports;
test('Albert Heijn receipt: merchant date final amount and receipt reference',()=>{
 const r=recognizeReceiptText('ALBERT HEIJN\n12-11-2026 14:37\nSubtotaal 17,00\nBTW 9% 1,40\nTOTAAL 18,40\nBON NR 009098');
 assert.equal(r.supplierName,'Albert Heijn');
 assert.equal(r.date,'2026-11-12');
 assert.equal(r.total,18.40);
 assert.equal(r.receiptNumber,'009098');
});
test('Discount and VAT do not override payable amount',()=>{
 const r=recognizeReceiptText('JUMBO\n22/10/26\nBONUS KORTING 11,00\nBTW 9% 2,01\nTOTAAL 26,79\nPIN 26,79');
 assert.equal(r.date,'2026-10-22');
 assert.equal(r.total,26.79);
 assert.equal(r.supplierName,'Jumbo');
});
test('Do not manufacture an amount or fake invalid dates',()=>{
 const r=recognizeReceiptText('Aldi\n31/02/2026\nKORTING 3,20\nBTW 9% 5,11');
 assert.equal(r.date,null);
 assert.equal(r.total,null);
});
test('Total with European grouping and payment line',()=>{
 const r=recognizeReceiptText('Makro\n2026-10-21\nTOTAAL TE BETALEN € 1.234,56\nPIN 1.234,56');
 assert.equal(r.total,1234.56);
 assert.equal(r.date,'2026-10-21');
});
test('Two digit decimal value',()=>{
 const r=recognizeReceiptText('HEMA\nTE BETALEN € 9,05');
 assert.equal(r.total,9.05);
});
test('No payment method or VAT extraction treated as total',()=>{
 const r=recognizeReceiptText('ALBERT HEIJN\nBTW 21% 9,00\nkorting 6,00');
 assert.equal(r.total,null);
});
