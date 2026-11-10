import { requireModulePermission, permissionAtLeast } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import CrewInvoiceAdminList from '@/components/CrewInvoiceAdminList';
import InvoiceInboxReview from '@/components/InvoiceInboxReview';
import {getInvoiceProcessingSettings,listEligibleApprovers} from '@/lib/invoice-processing-settings';
import {findCrewInvoiceMatch} from '@/lib/crew-invoice-matching';

export const dynamic='force-dynamic';
export default async function CrewInvoiceOfficePage(){
  const session=await requireModulePermission('billing','view');
  const canManage=session.profile.role==='admin'||permissionAtLeast(session.permissionLevel,'manage');
  const admin=createAdminClient();
  const [invoiceConfig,approvers]=await Promise.all([getInvoiceProcessingSettings(),listEligibleApprovers()]);
  const [invoicesResult,membersResult,inboxResult,imapResult,extractionsResult]=await Promise.all([
    admin.from('crew_invoices').select('id,crew_member_id,invoice_number,total_amount,status,correction_reason,created_at,approved_first_by,approved_second_by,approval_policy_one,approval_policy_two,forward_to,forward_attempted_at,forwarded_at,forward_error')
      .order('created_at',{ascending:false}).limit(150),
    admin.from('crew_portal_members').select('id,full_name,email,rentman_email,login_email_override,company_name,company_alias,invoice_email,portal_deleted'),
    admin.from('invoice_inbox_messages').select('id,sender,subject,received_at,status,attachments,error_message').order('received_by_portal_at',{ascending:false}).limit(100),
    admin.from('invoice_imap_settings').select('username,enabled,tested_at').eq('id',1).maybeSingle(),
    admin.from('invoice_pdf_extractions').select('id,message_id,attachment_index,filename,storage_path,status,invoice_number,invoice_date,total_amount,supplier_name,ai_fields,detected_emails,text_preview,processing_provider,processed_at,suggested_crew_member_id,match_strength,match_reason,extraction_notes,linked_invoice_id').order('created_at',{ascending:false}).limit(300)
  ]);
  const names=new Map((membersResult.data||[]).map(m=>[m.id,m.full_name]));
  // Invoice processing never depends on Rentman status or the member's portal login.
  const activeCrew=(membersResult.data||[]).filter(m=>!m.portal_deleted).map(m=>({
    id:m.id,full_name:m.full_name,company_name:m.company_name||null,
    company_alias:m.company_alias||null,invoice_email:m.invoice_email||null,
    email:m.email||null,rentman_email:m.rentman_email||null,login_email_override:m.login_email_override||null
  })).sort((a,b)=>a.full_name.localeCompare(b.full_name,'nl'));
  const updatedMatches=(extractionsResult.data||[]).map(e=>{
   const {text_preview:sourceText,...safe}=e;
   if(e.linked_invoice_id)return safe;
   const googleFields=(e.ai_fields||{}) as Record<string,{value?:string}>;
   const match=findCrewInvoiceMatch({
    supplierName:e.supplier_name||null,
    supplierEmail:googleFields.supplier_email?.value||null,
    detectedEmails:e.detected_emails||[],documentText:sourceText||null
   },activeCrew);
   return {...safe,suggested_crew_member_id:match.suggestedCrewMemberId,
    match_strength:match.strength,match_reason:match.reason};
  });
  const linkedPdfs=new Map((extractionsResult.data||[]).filter(e=>e.linked_invoice_id).map(e=>[e.linked_invoice_id,e.id]));
  const invoices=(invoicesResult.data||[]).map(i=>({
    id:i.id,extraction_id:linkedPdfs.get(i.id)||null,invoice_number:i.invoice_number,name:names.get(i.crew_member_id)||'Onbekende medewerker',
    total_amount:i.total_amount,status:i.status,correction_reason:i.correction_reason,created_at:i.created_at,
    approved_first_by:i.approved_first_by,approved_second_by:i.approved_second_by,
    approval_policy_one:i.approval_policy_one,approval_policy_two:i.approval_policy_two,
    forward_to:i.forward_to,forward_attempted_at:i.forward_attempted_at,forwarded_at:i.forwarded_at,forward_error:i.forward_error
  }));
  return <main className="container">
    <section className="hero"><div><h1>Inkomende facturen</h1>
      <p>Controleer de facturen van crewleden. Bij afwijkingen kun je een correctieverzoek per e-mail versturen.</p>
      <p>Gekoppelde mailbox: <strong>{imapResult.data?.username||'Nog geen mailbox ingesteld'}</strong> · {imapResult.data?.enabled?'Automatisch ophalen actief':imapResult.data?.tested_at?'Verbonden, automatisch ophalen uit':'Mailbox nog niet verbonden'}.</p>
    </div></section>
    {inboxResult.error||extractionsResult.error?<div className="error">Het ontvangen factuuroverzicht kon niet volledig worden geladen.</div>:
      <InvoiceInboxReview
        emails={(inboxResult.data||[]).map(m=>({...m,attachments:Array.isArray(m.attachments)?m.attachments as {filename:string;path:string;size:number}[]:[]}))}
        extractions={updatedMatches}
        members={activeCrew}
        canManage={canManage}/>}
    <section style={{marginTop:24}}><h2 style={{fontSize:21,margin:'0 0 14px'}}>Gekoppelde crewfacturen</h2>
    {invoicesResult.error?<div className="error">Facturen konden niet worden opgehaald.</div>:<CrewInvoiceAdminList invoices={invoices} canManage={canManage} currentUserId={session.user.id}
      approvers={approvers} configuredOne={invoiceConfig.approver_one||''}
      configuredTwo={invoiceConfig.approver_two||''} configuredForwardTo={invoiceConfig.forward_email}/>}
    </section>
  </main>;
}
