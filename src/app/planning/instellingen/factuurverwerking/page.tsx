import {requireAdmin} from '@/lib/auth';
import {getInvoiceProcessingSettings,listEligibleApprovers,publicProcessingSettings} from '@/lib/invoice-processing-settings';
import InvoiceProcessingSettings from '@/components/InvoiceProcessingSettings';
import SettingsWorkspace from '@/components/SettingsWorkspace';
export const dynamic='force-dynamic';
export default async function InvoiceProcessingSettingsPage(){
 await requireAdmin();
 const [settings,accounts]=await Promise.all([getInvoiceProcessingSettings(),listEligibleApprovers()]);
 return <SettingsWorkspace active="invoice-processing" title="Factuurverwerking"
  description="Beheer Google Document AI, de twee goedkeurders en het adres voor de boekhouding.">
   <InvoiceProcessingSettings initial={publicProcessingSettings(settings)} accounts={accounts}/>
 </SettingsWorkspace>;
}
