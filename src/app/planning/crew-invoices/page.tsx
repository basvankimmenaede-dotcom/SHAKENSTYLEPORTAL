import { requireModulePermission, permissionAtLeast } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import CrewInvoiceAdminList from '@/components/CrewInvoiceAdminList';

export const dynamic='force-dynamic';
export default async function CrewInvoiceOfficePage(){
  const session=await requireModulePermission('billing','view');
  const canManage=session.profile.role==='admin'||permissionAtLeast(session.permissionLevel,'manage');
  const admin=createAdminClient();
  const [invoicesResult,membersResult,settingsResult]=await Promise.all([
    admin.from('crew_invoices').select('id,crew_member_id,invoice_number,total_amount,status,correction_reason,created_at')
      .order('created_at',{ascending:false}).limit(150),
    admin.from('crew_portal_members').select('id,full_name'),
    admin.from('planning_settings').select('incoming_invoice_email').eq('id',1).maybeSingle()
  ]);
  const names=new Map((membersResult.data||[]).map(m=>[m.id,m.full_name]));
  const invoices=(invoicesResult.data||[]).map(i=>({
    id:i.id,invoice_number:i.invoice_number,name:names.get(i.crew_member_id)||'Onbekende medewerker',
    total_amount:i.total_amount,status:i.status,correction_reason:i.correction_reason,created_at:i.created_at
  }));
  return <main className="container">
    <section className="hero"><div><h1>Inkomende facturen</h1>
      <p>Controleer de facturen van crewleden. Bij afwijkingen kun je een correctieverzoek per e-mail versturen.</p>
      <p>Factuuradres: <strong>{settingsResult.data?.incoming_invoice_email||'Nog niet ingesteld'}</strong> · Automatische e-mailontvangst nog niet gekoppeld.</p>
    </div></section>
    {invoicesResult.error?<div className="error">Facturen konden niet worden opgehaald.</div>:<CrewInvoiceAdminList invoices={invoices} canManage={canManage}/>}
  </main>;
}
