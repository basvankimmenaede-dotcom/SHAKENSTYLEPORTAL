'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  assignUserProfile,
  saveUnifiedUser,
  deletePortalUser,
  inviteCustomer,
  resendUserInvite,
  sendUserPasswordReset,
  saveUserBrandAccess,
  saveUserPermissions,
  setUserPassword,
} from '@/app/admin/actions';

type PermissionKey = 'portal' | 'planning' | 'tasks' | 'billing' | 'checklists' | 'user_admin';
type PermissionLevel = 'none' | 'own' | 'view' | 'manage';

type Brand = {
  id: number;
  name: string;
  rentman_name?: string | null;
  portal_enabled: boolean;
};

type UserItem = {
  id: string;
  email: string;
  fullName: string | null;
  role: 'admin' | 'warehouse' | 'customer';
  distributorId: number | null;
  distributorName: string | null;
  crewMember: { id: string; active: boolean; rentmanCrewId: number | null } | null;
  assignedBrandIds: number[];
  availableBrandIds: number[];
  permissions: Record<PermissionKey, PermissionLevel>;
  invitedAt: string | null;
  confirmedAt: string | null;
  lastSignInAt: string | null;
};

type Distributor = { id: number; name: string };

const permissionDefinitions: Array<{
  key: PermissionKey;
  label: string;
  description: string;
  allowOwn?: boolean;
}> = [
  { key: 'planning', label: 'Planning', description: 'Projecten, crew en planning bekijken en beheren.' },
  { key: 'tasks', label: 'Taken', description: 'Planningstaken bekijken, afronden en toewijzen.', allowOwn: true },
  { key: 'checklists', label: 'Checklists', description: 'Projectchecklists bekijken en beheren.' },
  { key: 'portal', label: 'Klantenportaal', description: 'Toegang tot materialen per toegewezen merk.' },
  { key: 'billing', label: 'Facturatie', description: 'Toegang tot de financiële facturatiewerkvoorraad.' },
  { key: 'user_admin', label: 'Gebruikers & rechten', description: 'Gebruikers, rollen en rechten beheren.' },
];

function initials(value: string) {
  return value
    .replace(/@.*$/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

const ACTIVATION_FLOW_ROLLOUT = new Date('2026-10-05T09:20:00Z').getTime();

function statusOf(user: UserItem) {
  const invitedAt = user.invitedAt ? new Date(user.invitedAt).getTime() : 0;
  const confirmedAt = user.confirmedAt ? new Date(user.confirmedAt).getTime() : 0;
  const lastSignInAt = user.lastSignInAt ? new Date(user.lastSignInAt).getTime() : 0;

  // Accounts from before the new activation flow keep their known active state.
  if (invitedAt > 0 && invitedAt < ACTIVATION_FLOW_ROLLOUT && lastSignInAt) {
    return { key: 'active', label: 'Actief' };
  }

  // Opening an invite creates a Supabase session immediately. That is not yet
  // a completed activation. A later login proves the password setup was completed.
  if (confirmedAt && lastSignInAt > confirmedAt + 5000) {
    return { key: 'active', label: 'Actief' };
  }
  if (confirmedAt) return { key: 'started', label: 'Activatie gestart' };
  if (user.invitedAt) return { key: 'invited', label: 'Uitgenodigd' };
  return { key: 'inactive', label: 'Inactief' };
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function UsersManager({
  users,
  distributors,
  brands,
  currentUserId,
}: {
  users: UserItem[];
  distributors: Distributor[];
  brands: Brand[];
  currentUserId: string;
}) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'crew' | 'customer' | 'warehouse' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'invited' | 'inactive'>('all');
  const [tab, setTab] = useState<'general' | 'rights' | 'portal' | 'account'>('general');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editRole, setEditRole] = useState<'customer' | 'warehouse' | 'admin' | null>(null);
  const [inviteRole, setInviteRole] = useState<'customer' | 'warehouse' | 'admin'>('customer');
  const [accountMessage, setAccountMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [accountPending, startAccountTransition] = useTransition();

  const counts = useMemo(() => {
    const active = users.filter((user) => statusOf(user).key === 'active').length;
    const invited = users.filter((user) => ['invited', 'started'].includes(statusOf(user).key)).length;
    const inactive = users.length - active - invited;
    return { total: users.length, active, invited, inactive };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      const status = statusOf(user).key;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && status === 'active')
        || (statusFilter === 'invited' && ['invited', 'started'].includes(status))
        || (statusFilter === 'inactive' && status === 'inactive');
      const matchesQuery = !needle
        || user.email.toLowerCase().includes(needle)
        || (user.fullName ?? '').toLowerCase().includes(needle)
        || user.role.toLowerCase().includes(needle);
      const matchesRole = roleFilter === 'all' || (roleFilter === 'crew' ? Boolean(user.crewMember?.active) : user.role === roleFilter);
      return matchesStatus && matchesQuery && matchesRole;
    });
  }, [query, roleFilter, statusFilter, users]);

  const selectedUser = users.find((user) => user.id === selectedUserId)
    ?? filteredUsers[0]
    ?? users[0];

  if (!selectedUser) {
    return <main className="container usersAdminPage"><div className="notice">Geen gebruikers gevonden.</div></main>;
  }

  const status = statusOf(selectedUser);
  const assignedSet = new Set(selectedUser.assignedBrandIds);
  const availableSet = new Set(selectedUser.availableBrandIds);
  const availableBrands = brands.filter((brand) => availableSet.has(brand.id));

  return (
    <main className="container usersAdminPage">
      <section className="usersAdminHeader">
        <div>
          <span className="usersAdminEyebrow">Beheer</span>
          <h1>Gebruikers & rechten</h1>
          <p>Beheer gebruikers, rollen, moduletoegang en merktoegang vanuit één overzicht.</p>
        </div>
        <button
          className="button orange"
          type="button"
          onClick={() => {
            setInviteRole('customer');
            setInviteOpen(true);
          }}
        >
          Nieuwe gebruiker
        </button>
      </section>

      {inviteOpen ? (
        <div
          className="planningTaskCreateBackdrop"
          data-planning-modal-open="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInviteOpen(false);
          }}
        >
          <section className="planningTaskCreateModal" role="dialog" aria-modal="true" aria-labelledby="new-user-title">
            <button className="planningTaskCreateClose" type="button" onClick={() => setInviteOpen(false)}>×</button>
            <h2 id="new-user-title">Nieuwe gebruiker</h2>
            <p className="muted">Vul eerst de basisgegevens en rol in. De standaardrol is altijd Customer.</p>

            <form action={inviteCustomer} className="usersInviteForm" onSubmit={() => setInviteOpen(false)}>
              <div className="field">
                <label htmlFor="invite-name">Weergavenaam</label>
                <input id="invite-name" name="full_name" className="input" placeholder="Naam gebruiker" required />
              </div>

              <div className="field">
                <label htmlFor="invite-email">E-mailadres</label>
                <input id="invite-email" name="email" className="input" type="email" required placeholder="naam@bedrijf.nl" />
              </div>

              <div className="field">
                <label htmlFor="invite-role">Rol</label>
                <select
                  id="invite-role"
                  name="role"
                  className="select"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as 'customer' | 'warehouse' | 'admin')}
                >
                  <option value="customer">Customer</option>
                  <option value="warehouse">Magazijn</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {inviteRole === 'customer' ? (
                <div className="field">
                  <label htmlFor="invite-distributor">Organisatie</label>
                  <select id="invite-distributor" name="distributor_id" className="select" required defaultValue="">
                    <option value="" disabled>Kies organisatie</option>
                    {distributors.map((distributor) => (
                      <option value={distributor.id} key={distributor.id}>{distributor.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {inviteRole === 'admin' ? (
                <label className="usersBrandOption">
                  <input type="checkbox" name="confirm_admin" required />
                  <span>
                    <strong>Ja, deze gebruiker moet Admin worden</strong>
                    <small>Admins krijgen automatisch volledige toegang tot alle onderdelen.</small>
                  </span>
                </label>
              ) : null}

              <div className="planningTaskCreateActions">
                <button className="button secondary" type="button" onClick={() => setInviteOpen(false)}>Annuleren</button>
                <button className="button orange" type="submit">Gebruiker uitnodigen</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="usersWorkspace">
        <aside className="usersDirectory">
          <div className="usersDirectoryTabs usersRoleFilterTabs">
            {([['all','Alle'],['crew','Crew'],['customer','Klanten'],['warehouse','Magazijn'],['admin','Admins']] as const).map(([value,label]) => (
              <button key={value} type="button" className={roleFilter===value?'active':''} onClick={()=>setRoleFilter(value)}>{label}</button>
            ))}
          </div>
          <div className="usersDirectorySearch">
            <span>⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Zoek gebruiker..."
            />
          </div>

          <div className="usersDirectoryList">
            {filteredUsers.map((user) => {
              const userStatus = statusOf(user);
              return (
                <button
                  type="button"
                  className={user.id === selectedUser.id ? 'usersDirectoryRow active' : 'usersDirectoryRow'}
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setEditRole(null);
                    setTab('general');
                    setAccountMessage(null);
                  }}
                  key={user.id}
                >
                  <span className="usersAvatar">{initials(user.fullName || user.email)}</span>
                  <span className="usersDirectoryIdentity">
                    <strong>{user.fullName?.replace(/@shakenstyle\.com$/i, '') || user.email.split('@')[0]}</strong>
                    <small>{user.email}</small>
                  </span>
                  <span className="usersDirectoryMeta">
                    {user.crewMember?.active && <span className="usersRoleBadge">Crew</span>}
                    <span className={`usersRoleBadge ${user.role}`}>
                      {user.role === 'admin' ? 'Admin' : user.role === 'warehouse' ? 'Magazijn' : 'Customer'}
                    </span>
                    <i className={`usersStatusDot ${userStatus.key}`} aria-label={userStatus.label} />
                  </span>
                </button>
              );
            })}
            {!filteredUsers.length ? <p className="usersDirectoryEmpty">Geen gebruikers gevonden.</p> : null}
          </div>
        </aside>

        <section className="usersDetail">
          <header className="usersDetailHeader">
            <div className="usersDetailIdentity">
              <span className="usersAvatar large">{initials(selectedUser.fullName || selectedUser.email)}</span>
              <div>
                <div className="usersDetailTitle">
                  <h2>{selectedUser.fullName?.replace(/@shakenstyle\.com$/i, '') || selectedUser.email}</h2>
                  <span className={`usersStatusBadge ${status.key}`}>{status.label}</span>
                </div>
                <p>{selectedUser.email}</p>
                <small>
                  {selectedUser.invitedAt ? `Uitgenodigd ${formatDateTime(selectedUser.invitedAt)}` : 'Geen uitnodigingsdatum'}
                  {' · '}
                  {selectedUser.lastSignInAt ? `Laatste login ${formatDateTime(selectedUser.lastSignInAt)}` : 'Nog niet ingelogd'}
                </small>
              </div>
            </div>
            <div className="usersDetailActions">
              {selectedUser.role === 'customer' ? (
                <Link className="button secondary" href={`/portal?as=${encodeURIComponent(selectedUser.id)}`}>Bekijk als gebruiker</Link>
              ) : selectedUser.role === 'warehouse' ? (
                <Link className="button secondary" href="/planning">Open planning</Link>
              ) : null}
            </div>
          </header>

          {tab === 'general' ? (
            <div className="usersDetailPanel">
              <div className="usersDetailSectionHeader">
                <div><h3>Basisgegevens</h3><p>Rol en organisatie bepalen de standaardtoegang van deze gebruiker.</p></div>
              </div>

              <form action={saveUnifiedUser} key={selectedUser.id} className="usersUnifiedForm">
                <input type="hidden" name="user_id" value={selectedUser.id} />
                <input type="hidden" name="role" value={editRole ?? selectedUser.role} />
                <div className="usersUnifiedFields">
                  <div className="field"><label>Naam</label><input className="input" name="full_name" defaultValue={selectedUser.fullName || ''} /></div>
                  <div className="field"><label>E-mailadres</label><input className="input" value={selectedUser.email} readOnly /></div>
                  <div className="field"><label>Organisatie</label><select className="select" name="distributor_id" defaultValue={selectedUser.distributorId ?? ''}><option value="">Geen organisatie</option>{distributors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                </div>
                <h3>Rollen & toegang</h3>
                <p className="muted">Crew is aanvullend. Customer, Magazijn en Admin zijn exclusief om klantgegevens afgeschermd te houden.</p>
                <div className="usersUnifiedRoles">
                  <label className="usersUnifiedRole"><span><strong>Crew</strong><small>{selectedUser.crewMember?.rentmanCrewId ? 'Rentman medewerker #' + selectedUser.crewMember.rentmanCrewId : 'Rentman-koppeling vereist'}</small></span><input className="usersToggle" type="checkbox" name="crew_enabled" defaultChecked={Boolean(selectedUser.crewMember?.active)} disabled={!selectedUser.crewMember?.rentmanCrewId} /></label>
                  {(['customer','warehouse','admin'] as const).map(role=><label className="usersUnifiedRole" key={role}><span><strong>{role==='customer'?'Customer':role==='warehouse'?'Magazijn':'Admin'}</strong></span><input className="usersToggle" type="checkbox" checked={(editRole??selectedUser.role)===role} onChange={event=>{if(event.target.checked)setEditRole(role);}} /></label>)}
                </div>
                <div className="usersUnifiedFooter"><button className="button orange" type="submit">Wijzigingen opslaan</button></div>
              </form>
            </div>
          ) : null}

          <div className="usersUnifiedAdvanced"><h3>Overige instellingen</h3>          <nav className="usersDetailTabs">
            {([
              ['general', 'Algemeen'],
              ['rights', 'Rechten'],
              ['portal', 'Klantenportaal'],
              ['account', 'Account'],
            ] as const).map(([key, label]) => (
              <button
                type="button"
                className={tab === key ? 'active' : ''}
                onClick={() => setTab(key)}
                key={key}
              >
                {label}
              </button>
            ))}
          </nav>

</div>
          {tab === 'rights' ? (
            <div className="usersDetailPanel">
              <div className="usersDetailSectionHeader">
                <div><h3>Rechten</h3><p>Bepaal per onderdeel wat deze gebruiker mag zien en beheren.</p></div>
              </div>

              <form action={saveUserPermissions}>
                <input type="hidden" name="user_id" value={selectedUser.id} />
                <div className="usersPermissionsTable">
                  {permissionDefinitions.map((permission) => {
                    const current = selectedUser.role === 'admin'
                      ? 'manage'
                      : selectedUser.permissions[permission.key] ?? 'none';
                    return (
                      <div className="usersPermissionRow" key={permission.key}>
                        <div>
                          <strong>{permission.label}</strong>
                          <small>{permission.description}</small>
                        </div>
                        <select
                          name={`permission_${permission.key}`}
                          className="select"
                          defaultValue={current}
                          disabled={selectedUser.role === 'admin'}
                        >
                          <option value="none">Geen toegang</option>
                          {permission.allowOwn ? <option value="own">Alleen eigen</option> : null}
                          <option value="view">Bekijken</option>
                          <option value="manage">Beheren</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="usersPanelFooter">
                  {selectedUser.role === 'admin'
                    ? <span className="muted">Admins hebben automatisch volledige toegang.</span>
                    : <button className="button orange" type="submit">Rechten opslaan</button>}
                </div>
              </form>
            </div>
          ) : null}

          {tab === 'portal' ? (
            <div className="usersDetailPanel">
              <div className="usersDetailSectionHeader">
                <div><h3>Klantenportaal</h3><p>Wijs de merken toe waarvan deze gebruiker materialen mag zien.</p></div>
              </div>

              {selectedUser.role === 'admin' ? (
                <div className="notice">Admins hebben automatisch toegang tot alle actieve merken.</div>
              ) : selectedUser.permissions.portal === 'none' ? (
                <div className="notice">Geef deze gebruiker eerst minimaal <strong>Klantenportaal · Bekijken</strong> onder Rechten.</div>
              ) : (
                <form action={saveUserBrandAccess}>
                  <input type="hidden" name="user_id" value={selectedUser.id} />
                  <div className="usersBrandGrid">
                    {availableBrands.map((brand) => (
                      <label className="usersBrandOption" key={brand.id}>
                        <input type="checkbox" name="brand_ids" value={brand.id} defaultChecked={assignedSet.has(brand.id)} />
                        <span>
                          <strong>{brand.rentman_name ?? brand.name}</strong>
                          <small>{brand.portal_enabled ? 'Actief in portaal' : 'Niet actief'}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!availableBrands.length ? <p className="muted">Geen beschikbare merken voor deze gebruiker.</p> : null}
                  <div className="usersPanelFooter">
                    <button className="button orange" type="submit">Merktoegang opslaan</button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          {tab === 'account' ? (
            <div className="usersDetailPanel">
              <div className="usersDetailSectionHeader">
                <div><h3>Accountbeheer</h3><p>Beheer wachtwoord en account. Uitnodigingen en activatiestatus staan onder Algemeen.</p></div>
              </div>

              <div className="usersAccountGrid">
                <form action={setUserPassword} className="usersAccountPanel">
                  <input type="hidden" name="user_id" value={selectedUser.id} />
                  <div><strong>Wachtwoord wijzigen</strong><p>Stel direct een nieuw wachtwoord in.</p></div>
                  <div className="field"><label>Nieuw wachtwoord</label><input name="password" className="input" type="password" minLength={8} autoComplete="new-password" required /></div>
                  <div className="field"><label>Herhaal wachtwoord</label><input name="password_confirm" className="input" type="password" minLength={8} autoComplete="new-password" required /></div>
                  <button className="button orange" type="submit">Wachtwoord opslaan</button>
                </form>

                {selectedUser.id !== currentUserId ? (
                  <form action={deletePortalUser} className="usersAccountPanel danger">
                    <input type="hidden" name="user_id" value={selectedUser.id} />
                    <input type="hidden" name="expected_email" value={selectedUser.email} />
                    <div><strong>Gebruiker verwijderen</strong><p>Verwijdert het account en alle gekoppelde portalrechten definitief.</p></div>
                    <div className="field"><label>Typ het e-mailadres ter bevestiging</label><input name="confirm_email" className="input" type="email" placeholder={selectedUser.email} required /></div>
                    <button className="button dangerButton" type="submit">Gebruiker verwijderen</button>
                  </form>
                ) : (
                  <div className="usersAccountPanel danger">
                    <strong>Eigen adminaccount</strong>
                    <p>Je eigen adminaccount kan hier niet worden verwijderd.</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
