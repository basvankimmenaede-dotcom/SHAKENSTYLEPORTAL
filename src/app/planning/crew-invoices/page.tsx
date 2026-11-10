import { requireModulePermission, permissionAtLeast } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import CrewInvoiceAdminList from '@/components/CrewInvoiceAdminList';

export const dynamic='force-dynamic';
export default async function CrewInvoiceOfficePage(){
  const session=await requireModulePermission('billing','view');
  const canManage=session.profile.role==='admin'||permissionAtLeast(session.permissionLevel,'manage');
  const admin=createAdminClient();
  const [invoicesResult,membersResult,settingsResult,inboxResult,imapResult]=await Promise.all([
    admin.from('crew_invoices').select('id,crew_member_id,invoice_number,total_amount,status,correction_reason,created_at')
      .order('created_at',{ascending:false}).limit(150),
    admin.from('crew_portal_members').select('id,full_name'),
    admin.from('planning_settings').select('incoming_invoice_email').eq('id',1).maybeSingle(),
    admin.from('invoice_inbox_messages').select('id,sender,subject,received_at,status,attachments,error_message').order('received_by_portal_at',{ascending:false}).limit(100),
    admin.from('invoice_imap_settings').select('enabled,tested_at').eq('id',1).maybeSingle()
  ]);
  const names=new Map((membersResult.data||[]).map(m=>[m.id,m.full_name]));
  const invoices=(invoicesResult.data||[]).map(i=>({
    id:i.id,invoice_number:i.invoice_number,name:names.get(i.crew_member_id)||'Onbekende medewerker',
    total_amount:i.total_amount,status:i.status,correction_reason:i.correction_reason,created_at:i.created_at
  }));
  return <main className="container">
    <section className="hero"><div><h1>Inkomende facturen</h1>
      <p>Controleer de facturen van crewleden. Bij afwijkingen kun je een correctieverzoek per e-mail versturen.</p>
      <p>Factuuradres: <strong>{settingsResult.data?.incoming_invoice_email||'Nog niet ingesteld'}</strong> · {imapResult.data?.enabled?'Automatisch ophalen actief':imapResult.data?.tested_at?'Verbonden, automatisch ophalen uit':'Mailbox nog niet verbonden'}.</p>
    </div></section>
    <section className="card" style={{padding:20,marginBottom:20}}>
      <h2 style={{marginTop:0}}>Binnengekomen e-mails</h2>
      <p className="muted">Ook facturen van onbekende afzenders blijven hier zichtbaar. PDF's en originele e-mails worden privé opgeslagen.</p>
      {inboxResult.error?<div className="error">E-mails konden niet worden geladen.</div>:!inboxResult.data?.length?<div className="notice">Nog geen e-mails gesynchroniseerd.</div>:<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Afzender</th><th>Onderwerp</th><th>Datum</th><th>PDF's</th><th>Status</th></tr></thead><tbody>{inboxResult.data.map(m=><tr key={m.id}><td>{m.sender||'Onbekend'}</td><td>{m.subject||'Zonder onderwerp'}</td><td>{m.received_at?new Date(m.received_at).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):'—'}</td><td>{Array.isArray(m.attachments)?m.attachments.length:0}</td><td>{m.status==='received'?'Ontvangen':m.status==='no_pdf'?'Geen PDF':m.status==='too_large'?'Te groot':m.status==='processing_error'?'Verwerkingsfout':'Gekoppeld'}{m.error_message?' · '+m.error_message:''}</td></tr>)}</tbody></table></div>}
    </section>
    {invoicesResult.error?<div className="error">Facturen konden niet worden opgehaald.</div>:<CrewInvoiceAdminList invoices={invoices} canManage={canManage}/>}
  </main>;
}
