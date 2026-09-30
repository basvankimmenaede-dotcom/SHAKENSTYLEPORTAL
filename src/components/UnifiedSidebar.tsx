'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';

type NavItem = {
  href: string;
  label: string;
  match?: string[];
};

export default function UnifiedSidebar({
  mode,
  role,
  userLabel,
  canViewPortal = false,
  canViewPlanning = false,
  canViewBilling = false,
  canViewChecklists = false,
}: {
  mode: 'admin' | 'planning' | 'portal';
  role: 'admin' | 'warehouse' | 'customer';
  userLabel?: string | null;
  canViewPortal?: boolean;
  canViewPlanning?: boolean;
  canViewBilling?: boolean;
  canViewChecklists?: boolean;
}) {
  const pathname = usePathname();

  const portalLabel = role === 'warehouse' ? 'POS Portaal' : 'Klantenportaal';

  const internalItems: NavItem[] = [
    ...(canViewPlanning ? [{ href: '/planning', label: 'Planning', match: ['/planning'] }] : []),
    ...(canViewBilling ? [{ href: '/planning/billing', label: 'Facturatie', match: ['/planning/billing'] }] : []),
    ...(canViewChecklists ? [{ href: '/planning/afsluitlijst', label: 'Afsluitlijst', match: ['/planning/afsluitlijst'] }] : []),
    ...(canViewPortal ? [{ href: '/portal', label: portalLabel, match: ['/portal'] }] : []),
  ];

  const items: NavItem[] = role === 'admin'
    ? [
        { href: '/admin', label: 'Dashboard', match: ['/admin'] },
        { href: '/planning', label: 'Planning', match: ['/planning'] },
        { href: '/planning/billing', label: 'Facturatie', match: ['/planning/billing'] },
        { href: '/planning/afsluitlijst', label: 'Afsluitlijst', match: ['/planning/afsluitlijst'] },
        { href: '/admin/brands', label: 'Merken & materialen', match: ['/admin/brands'] },
        { href: '/admin/distributors', label: 'Distributeurs', match: ['/admin/distributors'] },
        { href: '/admin/users', label: 'Gebruikers & rechten', match: ['/admin/users'] },
        { href: '/portal', label: 'Klantenportaal', match: ['/portal'] },
      ]
    : internalItems.length
      ? internalItems
      : [{ href: '/account', label: 'Account', match: ['/account'] }];

  function isActive(item: NavItem) {
    if (item.href === '/admin') return pathname === '/admin';
    if (item.href === '/planning') return pathname === '/planning' || pathname === '/planning/templates' || pathname === '/planning/tv';
    return item.match?.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/')) ?? false;
  }

  const homeHref = role === 'admin'
    ? '/admin'
    : canViewPlanning
      ? '/planning'
      : canViewPortal
        ? '/portal'
        : '/account';

  return (
    <aside className="uiSidebar">
      <div className="uiSidebarBrand">
        <Link href={homeHref} aria-label="SHAKENSTYLE home">
          <BrandLogo compact />
        </Link>
      </div>

      <nav className="uiSidebarNav">
        {items.map((item) => (
          <Link
            href={item.href}
            className={isActive(item) ? 'uiSidebarLink active' : 'uiSidebarLink'}
            key={item.href}
          >
            <span className="uiSidebarDot" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="uiSidebarFooter">
        <Link href="/account" className={pathname === '/account' ? 'uiSidebarAccount active' : 'uiSidebarAccount'}>
          <span className="uiSidebarAvatar">
            {(userLabel || 'S').trim().slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{userLabel || 'SHAKENSTYLE'}</strong>
            <small>Account</small>
          </span>
        </Link>
        <LogoutButton />
      </div>
    </aside>
  );
}
