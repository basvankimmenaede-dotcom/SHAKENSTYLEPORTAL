'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';

function AcceptInviteForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let active = true;
    async function prepareInviteSession() {
      const supabase = createClient();
      const code = searchParams.get('code');
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) return;
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && active) setError('Deze uitnodiging is ongeldig of verlopen. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && active) setError('Deze uitnodiging is ongeldig of verlopen. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
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
    if (password.length < 8) return setError('Gebruik minimaal 8 tekens voor je wachtwoord.');
    if (password !== confirmPassword) return setError('De wachtwoorden zijn niet hetzelfde.');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setError('Je uitnodiging is ongeldig of verlopen. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) return setError('Je account kon niet worden geactiveerd. Probeer het opnieuw of vraag een nieuwe uitnodiging.');
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
        {checkingLink ? <p className="muted">Uitnodiging controleren...</p> : null}
        {!checkingLink && !error ? (
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="password">Wachtwoord</label><input className="input" id="password" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="field"><label htmlFor="confirmPassword">Herhaal wachtwoord</label><input className="input" id="confirmPassword" type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
            <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>{loading ? 'Account activeren...' : 'Account activeren'}</button>
          </form>
        ) : null}
        {!checkingLink && error ? <button type="button" className="textButton" onClick={() => router.replace('/login')}>Terug naar inloggen</button> : null}
      </section>
    </main>
  );
}

export default function AcceptInvitePage() {
  return <Suspense fallback={null}><AcceptInviteForm /></Suspense>;
}
