'use client';

import { usePathname } from 'next/navigation';
import UnifiedSidebar from './UnifiedSidebar';

export default function PlanningShell({
  children,
  role,
  canViewPortal = false,
  canViewBilling = false,
  canViewChecklists = false,
  userLabel,
}: {
  children: React.ReactNode;
  role: 'admin' | 'warehouse' | 'customer';
  canViewPortal?: boolean;
  canViewBilling?: boolean;
  canViewChecklists?: boolean;
  userLabel?: string | null;
}) {
  const pathname = usePathname();

  if (pathname === '/planning/tv') {
    return <>{children}</>;
  }

  return (
    <div className="uiAppShell">
      <UnifiedSidebar
        mode={role === 'admin' ? 'admin' : 'planning'}
        role={role}
        userLabel={userLabel}
        canViewPlanning
        canViewPortal={canViewPortal}
        canViewBilling={canViewBilling}
        canViewChecklists={canViewChecklists}
      />
      <div className="uiAppMain">{children}</div>
    </div>
  );
}
