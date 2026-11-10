import Link from 'next/link';
import {requireModulePermission,permissionAtLeast} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import CrewInvoiceAdminList from '@/components/CrewInvoiceAdminList';
import InvoiceInboxReview from '@/components/InvoiceInboxReview';
import InvoiceOfficeTabs,type {InvoiceTab} from '@/components/InvoiceOfficeTabs';
import InvoiceArchiveList from '@/components/InvoiceArchiveList';
import {getInvoiceProcessingSettings,listEligibleApprovers} from '@/lib/invoice-processing-settings';
import {findCrewInvoiceMatch} from '@/lib/crew-invoice-matching';
import {loadCrewInvoiceComparisons} from '@/lib/invoice-comparison-loader';

export const dynamic='force-dynamic';
const PAGE_SIZE=25;
const INVOICE_FIELDS='id,crew_member_id,invoice_number,invoice_date,total_amount,status,correction_reason,created_at,approved_first_by,approved_second_by,approval_policy_one,approval_policy_two,forward_to,forward_attempted_at,forwarded_at,forward_error,project_numbers,project_lines';
const REVIEW_FIELDS='id,message_id,attachment_index,filename,storage_path,status,invoice_number,invoice_date,total_amount,supplier_name,ai_fields,detected_emails,text_preview,processing_provider,processed_at,suggested_crew_member_id,match_strength,match_reason,extraction_notes,linked_invoice_id,project_numbers,project_lines';
type Query={view?:string;page?:string;inboxPage?:string;q?:string};
function pager(view:string,page:number,count:number,other:string=''){
 const pages=Math.ceil(count/PAGE_SIZE);
 if(pages<2)return null;
 return <div className="invoicePageNav">
  <span>Pagina {page} van {pages}</span>
  {page>1&&<Link className="button secondary" href={'/planning/crew-invoices?view='+view+'&page='+(page-1)+other}>Vorige</Link>}
  {page<pages&&<Link className="button secondary" href={'/planning/crew-invoices?view='+view+'&page='+(page+1)+other}>Volgende</Link>}
 </div>;
}
export default async function CrewInvoiceOfficePage({searchParams}:{searchParams:Promise<Query>}){
 const session=await requireModulePermission('billing','view');
 const canManage=session.profile.role==='admin'||permissionAtLeast(session.permissionLevel,'manage');
 const query=await searchParams;
 const view:InvoiceTab=query.view==='archive'?'archive':query.view==='differences'?'differences':'open';
 const page=Math.max(1,Math.min(200,Number.parseInt(query.page||'1',10)||1));
 const inboxPage=Math.max(1,Math.min(200,Number.parseInt(query.inboxPage||'1',10)||1));
 const search=(query.q||'').replace(/[^\p{L}\p{N}\s._-]/gu,'').trim().slice(0,65);
 const db=createAdminClient();
 const [config,approvers,membersResult,imapResult,openCount,archiveCount,inboxCount]=await Promise.all([
  getInvoiceProcessingSettings(),listEligibleApprovers(),
  db.from('crew_portal_members').select('id,full_name,email,rentman_email,login_email_override,company_name,company_alias,invoice_email,portal_deleted'),
  db.from('invoice_imap_settings').select('username,enabled,tested_at').eq('id',1).maybeSingle(),
  db.from('crew_invoices').select('id',{count:'exact',head:true}).or('status.neq.approved,forwarded_at.is.null'),
  db.from('crew_invoices').select('id',{count:'exact',head:true}).eq('status','approved').not('forwarded_at','is',null),
  db.from('invoice_inbox_messages').select('id',{count:'exact',head:true}).is('archived_at',null)
 ]);
 if(membersResult.error)throw new Error('Crewaccounts konden niet worden geladen.');
 const members=(membersResult.data||[]).filter(m=>!m.portal_deleted).map(m=>({
  id:m.id,full_name:m.full_name,company_name:m.company_name||null,
  company_alias:m.company_alias||null,invoice_email:m.invoice_email||null,
  email:m.email||null,rentman_email:m.rentman_email||null,login_email_override:m.login_email_override||null
 })).sort((a,b)=>a.full_name.localeCompare(b.full_name,'nl'));
 const names=new Map(members.map(m=>[m.id,m.full_name]));
 const matchingCrew=search?members.filter(m=>
  [m.full_name,m.company_name||'',m.company_alias||''].some(s=>s.toLowerCase().includes(search.toLowerCase()))).map(m=>m.id):[];
 const searchInvoice=<T extends {or:(value:string)=>T}>(queryBuilder:T):T=>{
  if(!search)return queryBuilder;
  const clauses=['invoice_number.ilike.%'+search+'%'];
  if(matchingCrew.length)clauses.push('crew_member_id.in.('+matchingCrew.join(',')+')');
  return queryBuilder.or(clauses.join(','));
 };
 let invoicesResult:{data:Record<string,unknown>[]|null;error:unknown;count:number|null};
 let inboxResult:{data:Record<string,unknown>[]|null;error:unknown;count:number|null}|null=null;
 let archivedEmailsResult:{data:Record<string,unknown>[]|null;error:unknown}|null=null;
 if(view==='archive'){
  const results=await Promise.all([
   searchInvoice(db.from('crew_invoices').select(INVOICE_FIELDS,{count:'exact'})
    .eq('status','approved').not('forwarded_at','is',null))
    .order('forwarded_at',{ascending:false}).range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1),
   db.from('invoice_inbox_messages').select('id,subject,sender,received_at,archived_at,archive_reason')
    .not('archived_at','is',null).neq('archive_reason','linked')
    .order('archived_at',{ascending:false}).range(0,24)
  ]);
  invoicesResult=results[0];
  archivedEmailsResult=results[1];
 }else if(view==='differences'){
  // Compute deviations from submitted reports. Never classify missing reports as actual time discrepancies.
  invoicesResult=await searchInvoice(db.from('crew_invoices').select(INVOICE_FIELDS,{count:'exact'})
   .or('status.neq.approved,forwarded_at.is.null')).order('created_at',{ascending:false}).limit(300);
 }else{
  const results=await Promise.all([
   searchInvoice(db.from('crew_invoices').select(INVOICE_FIELDS,{count:'exact'})
    .or('status.neq.approved,forwarded_at.is.null')).order('created_at',{ascending:false})
    .range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1),
   db.from('invoice_inbox_messages').select('id,sender,subject,received_at,status,attachments,error_message')
    .is('archived_at',null).order('received_by_portal_at',{ascending:false})
    .range((inboxPage-1)*PAGE_SIZE,inboxPage*PAGE_SIZE-1)
  ]);
  invoicesResult=results[0];
  inboxResult=results[1];
 }
 if(invoicesResult.error||inboxResult?.error||archivedEmailsResult?.error)
  throw new Error('Het factuuroverzicht kon niet volledig worden geladen.');
 type RawInvoice={
  id:string;crew_member_id:string;invoice_number:string;total_amount:number|null;status:string;
  correction_reason:string|null;created_at:string;approved_first_by:string|null;approved_second_by:string|null;
  approval_policy_one:string|null;approval_policy_two:string|null;forward_to:string|null;
  forward_attempted_at:string|null;forwarded_at:string|null;forward_error:string|null;
  project_numbers:string[];project_lines:unknown;
 };
 const rawInvoices=(invoicesResult.data||[]) as RawInvoice[];
 const emailRows=(inboxResult?.data||[]) as {id:string;sender:string|null;subject:string|null;received_at:string|null;status:string;attachments:unknown;error_message:string|null}[];
 const invoiceIds=rawInvoices.map(i=>i.id);
 const emailIds=emailRows.map(m=>m.id);
 const [linkedPdfs,openPdfs]=await Promise.all([
  invoiceIds.length?db.from('invoice_pdf_extractions')
   .select('id,linked_invoice_id').in('linked_invoice_id',invoiceIds).limit(400):
   Promise.resolve({data:[],error:null}),
  emailIds.length?db.from('invoice_pdf_extractions').select(REVIEW_FIELDS)
   .in('message_id',emailIds).order('created_at',{ascending:false}).limit(300):
   Promise.resolve({data:[],error:null})
 ]);
 if(linkedPdfs.error||openPdfs.error)throw new Error('PDF-koppelingen konden niet worden geladen.');
 const linkedMap=new Map((linkedPdfs.data||[]).map(e=>[e.linked_invoice_id,e.id]));
 const comparisons=await loadCrewInvoiceComparisons(rawInvoices.map(i=>({
  id:i.id,crew_member_id:i.crew_member_id,project_numbers:i.project_numbers,project_lines:i.project_lines
 })));
 const allMapped=rawInvoices.map(inv=>({
  ...inv,project_numbers:inv.project_numbers||[],
  project_lines:Array.isArray(inv.project_lines)?inv.project_lines:[],
  extraction_id:linkedMap.get(inv.id)||null,name:names.get(inv.crew_member_id)||'Onbekende medewerker'
 }));
 const visibleInvoices=view==='differences'?allMapped.filter(inv=>['difference','missing_report'].includes(comparisons[inv.id]?.status)) :allMapped;
 const filteredInvoices=view==='differences'?visibleInvoices.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE):visibleInvoices;
 const extractRows=(openPdfs.data||[]).map(e=>{
  const {text_preview:text,...safe}=e;
  if(e.linked_invoice_id)return safe;
  const fields=(e.ai_fields||{}) as Record<string,{value?:string}>;
  const match=findCrewInvoiceMatch({
   supplierName:e.supplier_name||null,supplierEmail:fields.supplier_email?.value||null,
   detectedEmails:e.detected_emails||[],documentText:text||null
  },members);
  return {...safe,suggested_crew_member_id:match.suggestedCrewMemberId,
   match_strength:match.strength,match_reason:match.reason};
 });
 const archiveInvoices=allMapped.map(inv=>({
  id:inv.id,invoice_number:inv.invoice_number,name:inv.name,total_amount:inv.total_amount,
  forwarded_at:inv.forwarded_at,forward_to:inv.forward_to,extraction_id:inv.extraction_id,
  project_numbers:inv.project_numbers
 }));
 const searchQuery=search?'&q='+encodeURIComponent(search):'';
 return <main className="container invoiceOfficePage">
  <section className="hero"><div>
   <h1>Inkomende facturen</h1>
   <p>Projectnummers, factuururen en shiftrapporten naast elkaar. Kantoor controleert de verschillen voordat twee accounts goedkeuren.</p>
   <p>Mailbox: <strong>{imapResult.data?.username||'Nog geen mailbox'}</strong> ·
     {imapResult.data?.enabled?' automatisch ophalen actief':' handmatig ophalen'}.</p>
  </div></section>
  <InvoiceOfficeTabs active={view} counts={{
   open:(openCount.count||0)+(inboxCount.count||0),archive:archiveCount.count||0,
   differences:view==='differences'?visibleInvoices.length:0
  }}/>
  <form className="invoiceOfficeSearch" method="get" action="/planning/crew-invoices">
   <input type="hidden" name="view" value={view}/>
   <input className="input" name="q" defaultValue={search} placeholder="Zoek op factuurnummer of medewerker"/>
   <button className="button secondary" type="submit">Zoeken</button>
   {search&&<Link className="button secondary" href={'/planning/crew-invoices?view='+view}>Wissen</Link>}
  </form>
  {view==='archive'?<>
   <div className="invoiceSectionHeader"><h2>Afgehandelde facturen</h2>
    <span>{invoicesResult.count||0} facturen · 25 per pagina</span></div>
   <InvoiceArchiveList invoices={archiveInvoices}
    emails={(archivedEmailsResult?.data||[]) as {id:string;subject:string|null;sender:string|null;received_at:string|null;archive_reason:string|null;archived_at:string|null}[]}
    comparisons={comparisons} canManage={canManage}/>
   {pager(view,page,invoicesResult.count||0,searchQuery)}
  </>:view==='differences'?<>
   <div className="invoiceSectionHeader"><h2>Afwijkingen & ontbrekende shiftrapporten</h2>
    <span>{visibleInvoices.length} binnen de meest recente 300 openstaande facturen</span></div>
   {filteredInvoices.length?<CrewInvoiceAdminList invoices={filteredInvoices} comparisons={comparisons}
    canManage={canManage} currentUserId={session.user.id} approvers={approvers}
    configuredOne={config.approver_one||''} configuredTwo={config.approver_two||''}
    configuredForwardTo={config.forward_email}/>:
    <div className="notice">Geen bekende afwijkingen in deze selectie. Onvolledig herkende facturen staan onder Te controleren.</div>}
   {pager(view,page,visibleInvoices.length,searchQuery)}
  </>:<>
   <section className="invoiceOfficeInbox">
    <div className="invoiceSectionHeader"><h2>Nog te verwerken e-mails</h2>
     <span>{inboxResult?.count||0} openstaand</span></div>
    <InvoiceInboxReview emails={emailRows.map(m=>({...m,attachments:Array.isArray(m.attachments)?m.attachments as {filename:string;path:string;size:number}[]:[]}))}
     extractions={extractRows} members={members} canManage={canManage}/>
    {inboxPage>1||((inboxResult?.count||0)>PAGE_SIZE)?<div className="invoicePageNav">
     <span>Pagina {inboxPage} van {Math.ceil((inboxResult?.count||0)/PAGE_SIZE)||1}</span>
     {inboxPage>1&&<Link className="button secondary" href={'?view=open&inboxPage='+(inboxPage-1)}>Vorige e-mails</Link>}
     {inboxPage*PAGE_SIZE<(inboxResult?.count||0)&&<Link className="button secondary" href={'?view=open&inboxPage='+(inboxPage+1)}>Volgende e-mails</Link>}
    </div>:null}
   </section>
   <section className="invoiceOfficePending">
    <div className="invoiceSectionHeader"><h2>Gekoppeld · wacht op controle</h2>
     <span>{invoicesResult.count||0} facturen</span></div>
    <CrewInvoiceAdminList invoices={visibleInvoices} comparisons={comparisons}
     canManage={canManage} currentUserId={session.user.id} approvers={approvers}
     configuredOne={config.approver_one||''} configuredTwo={config.approver_two||''}
     configuredForwardTo={config.forward_email}/>
    {pager(view,page,invoicesResult.count||0,searchQuery)}
   </section>
  </>}
 </main>;
}
