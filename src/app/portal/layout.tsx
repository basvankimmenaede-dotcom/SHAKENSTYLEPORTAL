import AppShell from '@/components/AppShell';
import { requireUser } from '@/lib/auth';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  return <AppShell adminPreview={profile.role === 'admin'}>{children}</AppShell>;
}
