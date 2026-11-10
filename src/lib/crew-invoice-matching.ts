/**
 * Pure, non-authoritative matching: proposes crew, never creates or approves invoices.
 * Source emails inside an invoice may include the recipient and should not be treated as proof of identity.
 */
export type CrewMatchMember={
 id:string;full_name:string;company_name:string|null;company_alias:string|null;
 invoice_email:string|null;email:string|null;rentman_email:string|null;login_email_override:string|null;
};
export type CrewMatchInput={
 supplierName:string|null;supplierEmail:string|null;detectedEmails:string[]|null;documentText?:string|null;
};
export type CrewMatchResult={
 suggestedCrewMemberId:string|null;
 strength:'strong'|'possible'|'ambiguous'|'none';
 reason:string;
};
const companyKey=(value:string|null|undefined)=>(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const mailKey=(value:string|null|undefined)=>(value||'').trim().toLowerCase();
export function findCrewInvoiceMatch(input:CrewMatchInput,members:CrewMatchMember[]):CrewMatchResult{
 const company=companyKey(input.supplierName),supplierEmail=mailKey(input.supplierEmail);
 const pdfEmails=new Set((input.detectedEmails||[]).map(mailKey).filter(Boolean));
 // Company mentions near the top of the invoice can suggest a match when the vendor label is missing.
 const headerKey=companyKey((input.documentText||'').slice(0,2200));
 type Candidate={id:string;score:number;company:boolean;companyFromText:boolean;invoiceEmail:boolean;supplierAccountEmail:boolean;pdfEmail:boolean};
 const candidates:Candidate[]=[];
 for(const m of members){
  const sameCompany=Boolean(company)&&[m.company_name,m.company_alias].some(n=>Boolean(companyKey(n))&&companyKey(n)===company);
  const companyFromText=!sameCompany&&[m.company_name,m.company_alias].some(n=>companyKey(n).length>=7&&headerKey.includes(companyKey(n)));
  const invoiceEmail=Boolean(supplierEmail)&&supplierEmail===mailKey(m.invoice_email);
  const otherAddresses=[m.email,m.rentman_email,m.login_email_override].map(mailKey).filter(Boolean);
  const supplierAccountEmail=Boolean(supplierEmail)&&otherAddresses.includes(supplierEmail);
  const pdfEmail=[m.invoice_email,...otherAddresses].map(mailKey).filter(Boolean).some(x=>pdfEmails.has(x));
  const score=(sameCompany?4:0)+(companyFromText?3:0)+(invoiceEmail?5:0)+(supplierAccountEmail?3:0)+(pdfEmail?1:0);
  if(score)candidates.push({id:m.id,score,company:sameCompany,companyFromText,invoiceEmail,supplierAccountEmail,pdfEmail});
 }
 if(!candidates.length)return {suggestedCrewMemberId:null,strength:'none',reason:'Geen overeenkomst gevonden. Selecteer de bartender handmatig.'};
 const companyIds=new Set(candidates.filter(c=>c.company||c.companyFromText).map(c=>c.id));
 const supplierEmailIds=new Set(candidates.filter(c=>c.invoiceEmail||c.supplierAccountEmail).map(c=>c.id));
 // Contradictory direct evidence: a supplier company and sender's invoice email refer to different people.
 if(companyIds.size>0&&supplierEmailIds.size>0&&![...companyIds].some(id=>supplierEmailIds.has(id))){
  return {suggestedCrewMemberId:null,strength:'ambiguous',reason:'Bedrijfsnaam en e-mailadres wijzen naar verschillende crewleden. Handmatig controleren.'};
 }
 candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const best=candidates[0],second=candidates[1];
 if(second&&second.score===best.score){
  return {suggestedCrewMemberId:null,strength:'ambiguous',reason:'Meerdere crewleden komen even goed overeen. Selecteer de juiste persoon.'};
 }
 const email=best.invoiceEmail||best.supplierAccountEmail;
 const strong=(best.company||best.companyFromText)&&email;
 const reason=strong?'Bedrijfsnaam én factuur-e-mailadres komen overeen.':
  best.invoiceEmail?'Factuur e-mailadres komt overeen.':
  best.supplierAccountEmail?'E-mailadres van het crewprofiel komt overeen.':
  best.company?'Bedrijfsnaam of handelsnaam komt overeen.':
  best.companyFromText?'Bedrijfsnaam gevonden in de PDF.':
  'Een e-mailadres in de PDF komt overeen; controleer of dit de leverancier is.';
 return {suggestedCrewMemberId:best.id,strength:strong?'strong':'possible',reason:'Voorgestelde match: '+reason+' Bevestig de koppeling na controle van de PDF.'};
}
