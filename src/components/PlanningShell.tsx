import Link from 'next/link';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';

export default function PlanningShell({ children }: { children: React.ReactNode }) {
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
          <Link href="/admin" className="planningPortalLink">Beheerportaal</Link>
          <LogoutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
