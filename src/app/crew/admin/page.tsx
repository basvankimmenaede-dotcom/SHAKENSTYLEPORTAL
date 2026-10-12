import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
export default async function LegacyCrewAdminPage(){
 await requireAdmin();
 redirect('/planning/instellingen/crew');
}
