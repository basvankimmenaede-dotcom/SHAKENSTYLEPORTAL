import Link from 'next/link';
import SyncRentmanButton from '@/components/SyncRentmanButton';
import { requireAdmin } from '@/lib/auth';

export default async function AdminDashboard() {
  const { supabase, profile } = await requireAdmin();

  const [{ count: distributors }, { count: brands }, { count: activeBrands }] = await Promise.all([
    supabase.from('distributors').select('*', { count: 'exact', head: true }),
    supabase.from('brands').select('*', { count: 'exact', head: true }),
    supabase.from('brands').select('*', { count: 'exact', head: true }).eq('portal_enabled', true).eq('is_brand', true),
  ]);

  return (
    <main className="container">
      <section className="hero">
        <div>
          <h1>Admin dashboard</h1>
          <p>Welkom {profile.full_name ?? 'SHAKENSTYLE'}. Beheer distributeurs, Rentman-mappen en klanttoegang.</p>
        </div>
        <SyncRentmanButton />
      </section>

      <section className="grid grid3">
        <div className="card"><div className="metric">{distributors ?? 0}</div><div className="muted">Distributeurs</div></div>
        <div className="card"><div className="metric">{brands ?? 0}</div><div className="muted">Rentman-hoofdmappen</div></div>
        <div className="card"><div className="metric">{activeBrands ?? 0}</div><div className="muted">Actief in portaal</div></div>
      </section>

      <section className="grid grid3" style={{ marginTop: 18 }}>
        <Link className="card" href="/admin/distributors">
          <h2>Distributeurs</h2>
          <p className="muted">Maak klanten aan en wijs zelf de merken toe die zij mogen zien.</p>
        </Link>
        <Link className="card" href="/admin/brands">
          <h2>Merken & Rentman</h2>
          <p className="muted">Nieuwe Rentman-hoofdmappen verschijnen na synchronisatie en staan standaard uit.</p>
        </Link>
        <Link className="card" href="/admin/users">
          <h2>Gebruikers</h2>
          <p className="muted">Nodig klantgebruikers uit en koppel ze aan een distributeur.</p>
        </Link>
      </section>
    </main>
  );
}
