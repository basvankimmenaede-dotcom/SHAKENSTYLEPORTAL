import AppShell from '@/components/AppShell';
import { requireAdmin } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <AppShell
      role={profile.role}
      admin
      userLabel={profile.full_name}
      canViewPortal
      canViewPlanning
      canViewBilling
    >
      {children}
    </AppShell>
  );
}
