import Link from 'next/link';
import LogoutButton from './LogoutButton';

export default function AppShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
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
            </>
          ) : (
            <Link href="/portal">Mijn merken</Link>
          )}
          <LogoutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
