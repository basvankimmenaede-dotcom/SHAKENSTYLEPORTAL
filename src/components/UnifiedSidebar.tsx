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
  userLabel,
  canViewPortal = false,
}: {
  mode: 'admin' | 'planning' | 'portal';
  userLabel?: string | null;
  canViewPortal?: boolean;
}) {
  const pathname = usePathname();

  const items: NavItem[] = mode === 'admin'
    ? [
        { href: '/admin', label: 'Dashboard', match: ['/admin'] },
        { href: '/planning', label: 'Planning', match: ['/planning'] },
        { href: '/planning/billing', label: 'Facturatie', match: ['/planning/billing'] },
        { href: '/admin/brands', label: 'Merken & materialen', match: ['/admin/brands'] },
        { href: '/admin/distributors', label: 'Distributeurs', match: ['/admin/distributors'] },
        { href: '/admin/users', label: 'Gebruikers & rechten', match: ['/admin/users'] },
        { href: '/portal', label: 'Klantenportaal', match: ['/portal'] },
      ]
    : mode === 'planning'
      ? [
          { href: '/planning', label: 'Planning', match: ['/planning'] },
          { href: '/planning/billing', label: 'Facturatie', match: ['/planning/billing'] },
          ...(canViewPortal ? [{ href: '/portal', label: 'Klantenportaal', match: ['/portal'] }] : []),
        ]
      : [
          { href: '/portal', label: 'Klantenportaal', match: ['/portal'] },
        ];

  function isActive(item: NavItem) {
    if (item.href === '/admin') return pathname === '/admin';
    if (item.href === '/planning') return pathname === '/planning' || pathname === '/planning/templates';
    return item.match?.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/')) ?? false;
  }

  return (
    <aside className="uiSidebar">
      <div className="uiSidebarBrand">
        <Link href={mode === 'admin' ? '/admin' : mode === 'planning' ? '/planning' : '/portal'} aria-label="SHAKENSTYLE home">
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
