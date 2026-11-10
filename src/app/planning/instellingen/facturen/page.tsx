import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {safeImapStatus} from '@/lib/invoice-imap';
import InvoiceEmailSettings from '@/components/InvoiceEmailSettings';
import SettingsWorkspace from '@/components/SettingsWorkspace';

export const dynamic='force-dynamic';

export default async function InvoiceMailboxSettingsPage(){
  await requireAdmin();
  const admin=createAdminClient();
  const [addressResult,imapResult]=await Promise.all([
    admin.from('planning_settings').select('incoming_invoice_email').eq('id',1).maybeSingle(),
    admin.from('invoice_imap_settings').select('host,port,username,password_encrypted,enabled,tested_at,last_sync_at,last_sync_result,last_error').eq('id',1).maybeSingle()
  ]);
  const defaults={host:'mail.antagonist.nl',port:993,username:'',password_encrypted:null,enabled:false,tested_at:null,last_sync_at:null,last_sync_result:null,last_error:null};
  const imap=safeImapStatus(imapResult.data||defaults);
  return <SettingsWorkspace active="invoice-email" title="Factuur e-mailadres" description="Beheer het ontvangstadres, de mailboxverbinding en het ophalen van facturen.">
    <InvoiceEmailSettings email={addressResult.data?.incoming_invoice_email??''} imap={imap}/>
  </SettingsWorkspace>;
}
