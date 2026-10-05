'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';

function inviteUserIdFromAccessToken(accessToken: string) {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(window.atob(padded)) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

async function waitForVerifiedInviteUser(
  supabase: ReturnType<typeof createClient>,
  expectedUserId: string,
) {
  const deadline = Date.now() + 3500;

  while (Date.now() < deadline) {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user?.id === expectedUserId) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user?.id === expectedUserId) return user;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  throw new Error('De invite-sessie kon niet aan de juiste gebruiker worden gekoppeld.');
}

function AcceptInviteForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [error, setError] = useState('');
  const invitedUserIdRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;

    async function prepareInviteSession() {
      // Capture invite credentials BEFORE creating the Supabase browser client.
      // The client may consume/clean the auth hash as soon as it initializes.
      const rawHash = window.location.hash;
      const hashParams = new URLSearchParams(rawHash.replace(/^#/, ''));
      const hashAccessToken = hashParams.get('access_token');

      const code = searchParams.get('code');
      const verified = searchParams.get('verified') === '1';
      const expectedUserId = searchParams.get('invite_user');
      const tokenHash = searchParams.get('token_hash');
      const queryType = searchParams.get('type');

      try {
        // SECURITY: for implicit invite links, derive only the expected user id
        // from the invite access token. Supabase is allowed to process the hash
        // exactly once; we never call setSession() with those same tokens.
        if (hashAccessToken) {
          const expectedInviteUserId = inviteUserIdFromAccessToken(hashAccessToken);
          if (!expectedInviteUserId) throw new Error('Invite gebruiker ontbreekt.');

          // Supabase's browser client processes the implicit-flow hash itself.
          // We only use the token payload to remember which user MUST emerge
          // from that verified session; we never set or rotate the session twice.
          const supabase = createClient();
          const user = await waitForVerifiedInviteUser(supabase, expectedInviteUserId);
          invitedUserIdRef.current = user.id;
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
          return;
        }

        if (code) {
          const supabase = createClient();
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError || !data.session?.user?.id) throw exchangeError ?? new Error('Invite session ontbreekt.');

          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user || user.id !== data.session.user.id) {
            throw new Error('Invite gebruiker kon niet worden geverifieerd.');
          }

          invitedUserIdRef.current = user.id;
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        if (tokenHash && queryType === 'invite') {
          const supabase = createClient();
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'invite',
          });
          if (verifyError || !data.user?.id) throw verifyError ?? new Error('Invite gebruiker ontbreekt.');

          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user || user.id !== data.user.id) {
            throw new Error('Invite gebruiker kon niet worden geverifieerd.');
          }

          invitedUserIdRef.current = user.id;
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        if (verified && expectedUserId) {
          const supabase = createClient();
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user || user.id !== expectedUserId) {
            throw new Error('De actieve sessie hoort niet bij deze uitnodiging.');
          }
          invitedUserIdRef.current = user.id;
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        throw new Error('Geen geldige uitnodigingsgegevens gevonden.');
      } catch {
        if (active) {
          invitedUserIdRef.current = null;
          setError('Deze uitnodiging kan niet veilig worden geactiveerd. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
        }
      } finally {
        if (active) setCheckingLink(false);
      }
    }

    void prepareInviteSession();
    return () => { active = false; };
  }, [searchParams]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Gebruik minimaal 8 tekens voor je wachtwoord.');
      return;
    }
    if (password !== confirmPassword) {
      setError('De wachtwoorden zijn niet hetzelfde.');
      return;
    }
    if (!invitedUserIdRef.current) {
      setError('Deze uitnodiging kan niet veilig worden geactiveerd. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      // Absolute guard: the password may ONLY be changed for the exact user
      // established by the invite credentials on this page.
      if (userError || !user || user.id !== invitedUserIdRef.current) {
        setError('De actieve sessie hoort niet bij deze uitnodiging. Er is niets gewijzigd.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Je account kon niet worden geactiveerd. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
        return;
      }

      router.replace('/portal');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <h1>Account activeren</h1>
        <p className="muted">Welkom bij het SHAKENSTYLE Portal. Kies een wachtwoord om je account te activeren.</p>
        {error ? <div className="error">{error}</div> : null}
        {checkingLink ? <p className="muted">Uitnodiging veilig controleren...</p> : null}

        {!checkingLink && !error ? (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">Wachtwoord</label>
              <input className="input" id="password" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Herhaal wachtwoord</label>
              <input className="input" id="confirmPassword" type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Account activeren...' : 'Account activeren'}
            </button>
          </form>
        ) : null}

        {!checkingLink && error ? (
          <div className="activationRecoveryActions">
            <button type="button" className="button orange" onClick={() => router.replace('/login')}>Inloggen</button>
            <a className="button secondary" href="mailto:info@shakenstyle.com?subject=Nieuwe%20uitnodiging%20SHAKENSTYLE%20Portal">
              Hulp nodig?
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function AcceptInvitePage() {
  return <Suspense fallback={null}><AcceptInviteForm /></Suspense>;
}
