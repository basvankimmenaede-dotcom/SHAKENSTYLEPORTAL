'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';

function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return withProtocol.replace(/\/$/, '');
  }
  return window.location.origin.replace(/\/$/, '');
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getAppUrl()}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message.toLowerCase().includes('rate limit')
          ? 'Er zijn te veel resetmails aangevraagd. Probeer het later opnieuw.'
          : 'De resetmail kon niet worden verstuurd. Probeer het opnieuw.');
        return;
      }
      setMessage('Als dit e-mailadres bij ons bekend is, ontvang je een link om je wachtwoord opnieuw in te stellen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <Link href="/login" className="eyebrowLink">← Terug naar inloggen</Link>
        <h1>Wachtwoord vergeten</h1>
        <p className="muted">Vul hieronder het e-mailadres in waarvoor je een nieuw wachtwoord wilt instellen.</p>
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="reset-email">E-mailadres</label>
            <input className="input" id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Resetmail versturen...' : 'Stuur resetlink'}
          </button>
        </form>
      </section>
    </main>
  );
}
