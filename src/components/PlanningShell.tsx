'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';

export default function PlanningShell({
  children,
  role,
  canViewPortal = false,
}: {
  children: React.ReactNode;
  role: 'admin' | 'warehouse' | 'customer';
  canViewPortal?: boolean;
}) {
  const pathname = usePathname();

  if (pathname === '/planning/tv') {
    return <>{children}</>;
  }

  return (
    <div className="planningShell">
      <header className="planningStandaloneTopbar">
        <Link href="/planning" className="planningBrand" aria-label="SHAKENSTYLE Planning">
          <BrandLogo compact />
          <span>Planning</span>
        </Link>
        <nav className="planningStandaloneNav">
          <Link href="/planning">Dashboard</Link>
          <Link href="/planning/tv">TV-weergave</Link>
          {canViewPortal ? <Link href="/portal">Klantenportaal</Link> : null}
          {role === 'admin' ? (
            <>
              <Link href="/planning/templates">Checklist-templates</Link>
              <Link href="/admin" className="planningPortalLink">Beheerportaal</Link>
            </>
          ) : null}
          <LogoutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
