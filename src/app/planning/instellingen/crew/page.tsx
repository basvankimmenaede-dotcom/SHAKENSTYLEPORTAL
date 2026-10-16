import {redirect} from 'next/navigation';
import {requireAdmin} from '@/lib/auth';
export default async function CrewSettingsRedirect(){await requireAdmin();redirect('/planning/instellingen/gebruikers');}
