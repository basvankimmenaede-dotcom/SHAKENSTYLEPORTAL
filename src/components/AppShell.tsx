import Link from 'next/link';
import LogoutButton from './LogoutButton';
import BrandLogo from './BrandLogo';

export default function AppShell({
  children,
  admin = false,
  adminPreview = false,
  portalLabel,
}: {
  children: React.ReactNode;
  admin?: boolean;
  adminPreview?: boolean;
  portalLabel?: string;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link href={admin ? '/admin' : '/portal'} className="brandLogoLink" aria-label="SHAKENSTYLE home">
          <BrandLogo compact />
        </Link>
        <nav className="topnav">
          {admin ? (
            <>
              <Link href="/admin">Dashboard</Link>
              <Link href="/admin/distributors">Distributeurs</Link>
              <Link href="/admin/brands">Merken</Link>
              <Link href="/admin/users">Gebruikers</Link>
              <Link href="/portal" className="previewLink">Gebruikersweergave</Link>
            </>
          ) : (
            <>
              {adminPreview ? <Link href="/admin" className="previewLink">Terug naar beheer</Link> : null}
              <Link href="/portal">{portalLabel || (adminPreview ? 'Alle merken' : 'Portaal')}</Link>
            </>
          )}
          <LogoutButton />
        </nav>
      </header>
      {adminPreview ? (
        <div className="previewBanner">Admin gebruikersweergave — je bekijkt nu het klantportaal.</div>
      ) : null}
      {children}
    </div>
  );
}
