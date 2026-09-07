import AppShell from '@/components/AppShell';
import { requireAdmin } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AppShell admin>{children}</AppShell>;
}
