import AppShell from '@/components/AppShell';
import { requireUser } from '@/lib/auth';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  if (profile.role === 'admin') {
    return <AppShell>{children}</AppShell>;
  }
  return <AppShell>{children}</AppShell>;
}
