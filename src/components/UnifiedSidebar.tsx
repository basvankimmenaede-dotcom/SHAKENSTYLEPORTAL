'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeEuro,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  PackageSearch,
  Route,
  Settings,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
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
  void mode;

  const portalLabel = role === 'warehouse' ? 'POS Portaal' : 'Klantenportaal';

  const planningItems: NavItem[] = [
    ...(canViewPlanning || role === 'admin' ? [
      { href: '/planning', label: 'Planning', icon: CalendarDays, match: ['/planning'] },
      { href: '/planning/open-shifts', label: 'Open shifts', icon: CalendarClock, match: ['/planning/open-shifts'] },
      { href: '/planning/logistics', label: 'Logistiek', icon: Route, match: ['/planning/logistics'] },
    ] : []),
    ...(canViewBilling || role === 'admin' ? [
      { href: '/planning/billing', label: 'Facturatie', icon: BadgeEuro, match: ['/planning/billing'] },
    ] : []),
    ...(canViewChecklists || role === 'admin' ? [
      { href: '/planning/afsluitlijst', label: 'Afsluitlijst', icon: ClipboardCheck, match: ['/planning/afsluitlijst'] },
    ] : []),
    ...(canViewPlanning || role === 'admin' ? [
      { href: '/planning/rentman-wijzigingen', label: 'Rentman wijzigingen', icon: SlidersHorizontal, match: ['/planning/rentman-wijzigingen'] },
    ] : []),
  ];

  const adminItems: NavItem[] = role === 'admin' ? [
    { href: '/admin/brands', label: 'Merken & materialen', icon: Boxes, match: ['/admin/brands'] },
    { href: '/admin/distributors', label: 'Distributeurs', icon: Building2, match: ['/admin/distributors'] },
    { href: '/admin/users', label: 'Gebruikers & rechten', icon: Users, match: ['/admin/users'] },
    { href: '/planning/instellingen', label: 'Instellingen', icon: Settings, match: ['/planning/instellingen', '/planning/templates', '/planning/afsluitlijst/beheer', '/planning/tv'] },
  ] : [];

  function isActive(item: NavItem) {
    if (item.href === '/admin') return pathname === '/admin';
    if (item.href === '/planning') return pathname === '/planning';
    return item.match?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
  }

  function itemLink(item: NavItem) {
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        className={isActive(item) ? 'uiSidebarLink active' : 'uiSidebarLink'}
        key={item.href}
      >
        <span className="uiSidebarIcon"><Icon size={16} strokeWidth={1.9} /></span>
        <span>{item.label}</span>
      </Link>
    );
  }

  const homeHref = role === 'admin' ? '/admin' : canViewPlanning ? '/planning' : canViewPortal ? '/portal' : '/account';
  const planningOpen = pathname.startsWith('/planning');
  const adminOpen = pathname.startsWith('/admin') && pathname !== '/admin';

  return (
    <aside className="uiSidebar">
      <div className="uiSidebarBrand">
        <Link href={homeHref} aria-label="SHAKENSTYLE home"><BrandLogo compact /></Link>
      </div>

      <nav className="uiSidebarNav">
        {role === 'admin' ? itemLink({ href: '/admin', label: 'Dashboard', icon: Gauge, match: ['/admin'] }) : null}

        {planningItems.length ? (
          <details className="uiSidebarGroup" open={planningOpen || undefined}>
            <summary>
              <span><CalendarDays size={16} strokeWidth={1.9} /> Planning</span>
              <ChevronDown size={14} />
            </summary>
            <div className="uiSidebarGroupItems">{planningItems.map(itemLink)}</div>
          </details>
        ) : null}

        {adminItems.length ? (
          <details className="uiSidebarGroup" open={adminOpen || undefined}>
            <summary>
              <span><Settings size={16} strokeWidth={1.9} /> Beheer</span>
              <ChevronDown size={14} />
            </summary>
            <div className="uiSidebarGroupItems">{adminItems.map(itemLink)}</div>
          </details>
        ) : null}

        {canViewPortal || role === 'admin'
          ? itemLink({ href: '/portal', label: portalLabel, icon: PackageSearch, match: ['/portal'] })
          : null}

        {!planningItems.length && !canViewPortal && role !== 'admin'
          ? itemLink({ href: '/account', label: 'Account', icon: CheckSquare2, match: ['/account'] })
          : null}
      </nav>

      <div className="uiSidebarFooter">
        <Link href="/account" className={pathname === '/account' ? 'uiSidebarAccount active' : 'uiSidebarAccount'}>
          <span className="uiSidebarAvatar">{(userLabel || 'S').trim().slice(0, 1).toUpperCase()}</span>
          <span><strong>{userLabel || 'SHAKENSTYLE'}</strong><small>Account</small></span>
        </Link>
        <LogoutButton />
      </div>
    </aside>
  );
}
