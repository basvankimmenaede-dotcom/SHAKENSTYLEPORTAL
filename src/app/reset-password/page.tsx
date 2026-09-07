'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      const supabase = createClient();
      const code = searchParams.get('code');

      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) return;

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && active) {
            setError('Deze resetlink is ongeldig of verlopen. Vraag een nieuwe resetmail aan.');
          }
          return;
        }

        // For hash-based recovery links, supabase-js processes the URL automatically.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && active) {
          setError('Deze resetlink is ongeldig of verlopen. Vraag een nieuwe resetmail aan.');
        }
      } finally {
        if (active) setCheckingLink(false);
      }
    }

    void prepareRecoverySession();
    return () => { active = false; };
  }, [searchParams]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Gebruik minimaal 8 tekens voor je nieuwe wachtwoord.');
      return;
    }
    if (password !== confirmPassword) {
      setError('De wachtwoorden zijn niet hetzelfde.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Je resetlink is ongeldig of verlopen. Vraag een nieuwe resetmail aan.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Het wachtwoord kon niet worden gewijzigd. Vraag eventueel een nieuwe resetmail aan.');
        return;
      }

      await supabase.auth.signOut();
      router.replace('/login?reset=success');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginLogo">SHAKEN<span>STYLE</span></div>
        <h1>Nieuw wachtwoord</h1>
        <p className="muted">Kies een nieuw wachtwoord voor je Storage Portal-account.</p>
        {error ? <div className="error">{error}</div> : null}
        {checkingLink ? <p className="muted">Resetlink controleren...</p> : null}

        {!checkingLink && !error ? (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">Nieuw wachtwoord</label>
              <input className="input" id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Herhaal wachtwoord</label>
              <input className="input" id="confirmPassword" type="password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Opslaan...' : 'Wachtwoord wijzigen'}
            </button>
          </form>
        ) : null}

        {!checkingLink && error ? (
          <button type="button" className="textButton" onClick={() => router.replace('/login')}>
            Terug naar inloggen
          </button>
        ) : null}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordForm /></Suspense>;
}
