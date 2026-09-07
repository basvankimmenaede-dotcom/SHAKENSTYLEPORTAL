import Link from 'next/link';
import LogoutButton from './LogoutButton';

export default function AppShell({
  children,
  admin = false,
  adminPreview = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
  adminPreview?: boolean;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link href={admin ? '/admin' : '/portal'} className="brand">SHAKEN<span>STYLE</span></Link>
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
              <Link href="/portal">Mijn merken</Link>
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
