import {requireModulePermission} from '@/lib/auth';
import {synchronizeCrewAssignments} from '@/lib/crew/synchronize-assignments';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(){
 await requireModulePermission('user_admin','manage');
 return synchronizeCrewAssignments();
}
