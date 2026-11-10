import { requireModulePermission, permissionAtLeast } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import CrewInvoiceAdminList from '@/components/CrewInvoiceAdminList';
import InvoiceInboxReview from '@/components/InvoiceInboxReview';

export const dynamic='force-dynamic';
export default async function CrewInvoiceOfficePage(){
  const session=await requireModulePermission('billing','view');
  const canManage=session.profile.role==='admin'||permissionAtLeast(session.permissionLevel,'manage');
  const admin=createAdminClient();
  const [invoicesResult,membersResult,inboxResult,imapResult,extractionsResult]=await Promise.all([
    admin.from('crew_invoices').select('id,crew_member_id,invoice_number,total_amount,status,correction_reason,created_at')
      .order('created_at',{ascending:false}).limit(150),
    admin.from('crew_portal_members').select('id,full_name,active'),
    admin.from('invoice_inbox_messages').select('id,sender,subject,received_at,status,attachments,error_message').order('received_by_portal_at',{ascending:false}).limit(100),
    admin.from('invoice_imap_settings').select('username,enabled,tested_at').eq('id',1).maybeSingle(),
    admin.from('invoice_pdf_extractions').select('id,message_id,attachment_index,filename,storage_path,status,invoice_number,invoice_date,total_amount,supplier_name,suggested_crew_member_id,extraction_notes,linked_invoice_id').order('created_at',{ascending:false}).limit(300)
  ]);
  const names=new Map((membersResult.data||[]).map(m=>[m.id,m.full_name]));
  const activeCrew=(membersResult.data||[]).filter(m=>m.active).map(m=>({id:m.id,full_name:m.full_name})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'nl'));
  const invoices=(invoicesResult.data||[]).map(i=>({
    id:i.id,invoice_number:i.invoice_number,name:names.get(i.crew_member_id)||'Onbekende medewerker',
    total_amount:i.total_amount,status:i.status,correction_reason:i.correction_reason,created_at:i.created_at
  }));
  return <main className="container">
    <section className="hero"><div><h1>Inkomende facturen</h1>
      <p>Controleer de facturen van crewleden. Bij afwijkingen kun je een correctieverzoek per e-mail versturen.</p>
      <p>Gekoppelde mailbox: <strong>{imapResult.data?.username||'Nog geen mailbox ingesteld'}</strong> · {imapResult.data?.enabled?'Automatisch ophalen actief':imapResult.data?.tested_at?'Verbonden, automatisch ophalen uit':'Mailbox nog niet verbonden'}.</p>
    </div></section>
    {inboxResult.error||extractionsResult.error?<div className="error">Het ontvangen factuuroverzicht kon niet volledig worden geladen.</div>:
      <InvoiceInboxReview
        emails={(inboxResult.data||[]).map(m=>({...m,attachments:Array.isArray(m.attachments)?m.attachments as {filename:string;path:string;size:number}[]:[]}))}
        extractions={extractionsResult.data||[]}
        members={activeCrew}
        canManage={canManage}/>}
    <section style={{marginTop:24}}><h2 style={{fontSize:21,margin:'0 0 14px'}}>Gekoppelde crewfacturen</h2>
    {invoicesResult.error?<div className="error">Facturen konden niet worden opgehaald.</div>:<CrewInvoiceAdminList invoices={invoices} canManage={canManage}/>}
    </section>
  </main>;
}
