'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
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

function createIsolatedInviteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase browser environment variables are missing.');
  }

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function AcceptInviteForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [error, setError] = useState('');
  const invitedUserIdRef = useRef<string | null>(null);
  const inviteClientRef = useRef<SupabaseClient | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function prepareInviteSession() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      try {
        if (!accessToken || !refreshToken) {
          throw new Error('Invite tokens ontbreken.');
        }

        const expectedUserId = inviteUserIdFromAccessToken(accessToken);
        if (!expectedUserId) {
          throw new Error('Invite gebruiker ontbreekt.');
        }

        // Use a completely isolated auth client for invite activation.
        // It does not read or write the portal's normal SSR/cookie session.
        const inviteClient = createIsolatedInviteClient();
        inviteClientRef.current = inviteClient;

        const { error: sessionError } = await inviteClient.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;

        const { data: { user }, error: userError } = await inviteClient.auth.getUser();
        if (userError || !user || user.id !== expectedUserId) {
          throw new Error('De invite-sessie hoort niet bij de uitgenodigde gebruiker.');
        }

        invitedUserIdRef.current = expectedUserId;

        // Remove credentials from the visible URL after successful verification.
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        inviteClientRef.current = null;
        invitedUserIdRef.current = null;
        if (active) {
          setError('Deze uitnodiging kan niet veilig worden geactiveerd. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
        }
      } finally {
        if (active) setCheckingLink(false);
      }
    }

    void prepareInviteSession();
    return () => {
      active = false;
    };
  }, []);

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

    const inviteClient = inviteClientRef.current;
    const expectedUserId = invitedUserIdRef.current;
    if (!inviteClient || !expectedUserId) {
      setError('Deze uitnodiging kan niet veilig worden geactiveerd. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
      return;
    }

    setLoading(true);
    try {
      // Final hard guard immediately before the password mutation.
      const { data: { user }, error: userError } = await inviteClient.auth.getUser();
      if (userError || !user || user.id !== expectedUserId) {
        setError('De actieve invite-sessie hoort niet bij deze uitnodiging. Er is niets gewijzigd.');
        return;
      }

      const { error: updateError } = await inviteClient.auth.updateUser({ password });
      if (updateError) {
        setError('Je account kon niet worden geactiveerd. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
        return;
      }

      await inviteClient.auth.signOut({ scope: 'local' });
      router.replace('/login?activated=success');
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
              <input
                className="input"
                id="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Herhaal wachtwoord</label>
              <input
                className="input"
                id="confirmPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Account activeren...' : 'Account activeren'}
            </button>
          </form>
        ) : null}

        {!checkingLink && error ? (
          <div className="activationRecoveryActions">
            <button type="button" className="button orange" onClick={() => router.replace('/login')}>Inloggen</button>
            <a
              className="button secondary"
              href="mailto:info@shakenstyle.com?subject=Nieuwe%20uitnodiging%20SHAKENSTYLE%20Portal"
            >
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
