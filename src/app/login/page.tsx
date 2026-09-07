'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError('E-mailadres of wachtwoord klopt niet.'); return; }
      router.replace('/'); router.refresh();
    } finally { setLoading(false); }
  }

  async function forgotPassword() {
    setError(''); setMessage('');
    if (!email.trim()) { setError('Vul eerst je e-mailadres in.'); return; }
    setResetLoading(true);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) { setError('De resetmail kon niet worden verstuurd. Probeer het opnieuw.'); return; }
      setMessage('Als dit e-mailadres bij ons bekend is, ontvang je zo een link om je wachtwoord opnieuw in te stellen.');
    } finally { setResetLoading(false); }
  }

  return (
    <main className="loginPage"><section className="loginCard">
      <div className="loginLogo">SHAKEN<span>STYLE</span></div>
      <h1>Storage Portal</h1>
      <p className="muted">Log in om jouw opgeslagen merken en materialen te bekijken.</p>
      {searchParams.get('error') === 'profile' ? <div className="error">Je account bestaat, maar heeft nog geen portalprofiel. Neem contact op met SHAKENSTYLE.</div> : null}
      {searchParams.get('reset') === 'success' ? <div className="success">Je wachtwoord is gewijzigd. Je kunt nu inloggen.</div> : null}
      {searchParams.get('error') === 'reset-link' ? <div className="error">Deze resetlink is ongeldig of verlopen. Vraag hieronder een nieuwe aan.</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="email">E-mailadres</label><input className="input" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="password">Wachtwoord</label><input className="input" id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="button orange" type="submit" disabled={loading || resetLoading} style={{ width: '100%' }}>{loading ? 'Inloggen...' : 'Inloggen'}</button>
      </form>
      <button type="button" className="textButton" onClick={forgotPassword} disabled={loading || resetLoading}>{resetLoading ? 'Resetmail versturen...' : 'Wachtwoord vergeten?'}</button>
    </section></main>
  );
}

export default function LoginPage() { return <Suspense fallback={null}><LoginForm /></Suspense>; }
