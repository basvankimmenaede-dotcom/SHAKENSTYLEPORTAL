'use client';

import { usePathname } from 'next/navigation';
import UnifiedSidebar from './UnifiedSidebar';

export default function PlanningShell({
  children,
  role,
  canViewPortal = false,
  userLabel,
}: {
  children: React.ReactNode;
  role: 'admin' | 'warehouse' | 'customer';
  canViewPortal?: boolean;
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
        userLabel={userLabel}
        canViewPortal={canViewPortal}
      />
      <div className="uiAppMain">{children}</div>
    </div>
  );
}
