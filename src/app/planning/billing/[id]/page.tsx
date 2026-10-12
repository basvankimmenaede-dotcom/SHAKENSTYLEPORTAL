import { requireModulePermission } from '@/lib/auth';
import BillingDraftEditor from '@/components/BillingDraftEditor';

export default async function BillingDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { permissionLevel } = await requireModulePermission('billing', 'view');
  const { id } = await params;
  return <BillingDraftEditor id={id} canManage={permissionLevel === 'manage'} />;
}
