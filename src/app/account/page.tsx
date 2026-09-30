import AppShell from '@/components/AppShell';
import PasswordChangeForm from './PasswordChangeForm';
import { getUserPermissionLevel, permissionAtLeast, requireUser } from '@/lib/auth';

export default async function AccountPage() {
  const { user, profile, supabase } = await requireUser();
  let portalLabel = profile.role === 'admin' ? 'Alle merken' : 'Portaal';
  let distributorName = '';

  const [portalLevel, planningLevel, billingLevel] = profile.role === 'admin'
    ? ['manage', 'manage', 'manage'] as const
    : await Promise.all([
        getUserPermissionLevel(supabase, user.id, 'portal'),
        getUserPermissionLevel(supabase, user.id, 'planning'),
        getUserPermissionLevel(supabase, user.id, 'billing'),
      ]);
  const canViewPortal = profile.role === 'admin' || permissionAtLeast(portalLevel, 'view');
  const canViewPlanning = profile.role === 'admin' || permissionAtLeast(planningLevel, 'view');
  const canViewBilling = profile.role === 'admin' || permissionAtLeast(billingLevel, 'view');

  if (profile.role !== 'admin' && profile.distributor_id) {
    const { data: distributor } = await supabase
      .from('distributors')
      .select('name')
      .eq('id', profile.distributor_id)
      .single();

    if (distributor?.name) {
      distributorName = distributor.name;
      portalLabel = distributor.name;
    }
  }

  return (
    <AppShell
      role={profile.role}
      admin={profile.role === 'admin'}
      adminPreview={false}
      portalLabel={portalLabel}
      userLabel={profile.full_name}
      canViewPortal={canViewPortal}
      canViewPlanning={canViewPlanning}
      canViewBilling={canViewBilling}
    >
      <main className="accountPage">
        <section className="hero accountHero">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Accountgegevens</h1>
            <p>Beheer je eigen inloggegevens voor het SHAKENSTYLE Portal.</p>
          </div>
        </section>

        <div className="accountContent">
        <section className="card accountDetailsCard">
          <div className="accountSectionHeader">
            <h2>Profiel</h2>
            <p className="muted">Je accountgegevens.</p>
          </div>
          <div className="accountProfileGrid">
            <div>
              <span className="muted">Naam</span>
              <strong>{profile.full_name || 'Niet ingevuld'}</strong>
            </div>
            <div>
              <span className="muted">E-mailadres</span>
              <strong>{user.email || 'Niet beschikbaar'}</strong>
            </div>
            {distributorName ? (
              <div>
                <span className="muted">Organisatie</span>
                <strong>{distributorName}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className="card accountDetailsCard">
          <div className="accountSectionHeader">
            <h2>Wachtwoord wijzigen</h2>
            <p className="muted">Kies een nieuw wachtwoord van minimaal 8 tekens.</p>
          </div>
          <PasswordChangeForm />
        </section>
        </div>
      </main>
    </AppShell>
  );
}
