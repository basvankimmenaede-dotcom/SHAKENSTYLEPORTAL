'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { authErrorMessage } from '@/lib/email-code';
import BrandLogo from '@/components/BrandLogo';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) {
        setError(authErrorMessage(signInError, 'login'));
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Inloggen lukt nu niet. Controleer je verbinding en probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }



  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <p className="muted" style={{fontSize:11,fontWeight:800,letterSpacing:'.07em',marginBottom:5}}>KLANTEN & INTERN</p>
        <h1>SHAKENSTYLE Portal</h1>
        <p className="muted">Log in met je klant- of interne account. Voor bartenders is er een aparte crewomgeving.</p>
        {searchParams.get('error') === 'profile' ? <div className="error">Je account bestaat, maar heeft nog geen portalprofiel. Neem contact op met SHAKENSTYLE.</div> : null}
        {searchParams.get('activated') === 'success' ? (
          <div className="success activationSuccess">
            <strong>Account succesvol aangemaakt</strong>
            <span>Je wachtwoord is ingesteld. Log hieronder in met je e-mailadres en nieuwe wachtwoord.</span>
          </div>
        ) : null}
        {searchParams.get('reset') === 'success' ? <div className="success">Je wachtwoord is gewijzigd. Je kunt nu inloggen.</div> : null}
        {searchParams.get('error') === 'reset-link' ? <div className="error">Deze resetlink is ongeldig of verlopen. Vraag via ‘Wachtwoord vergeten?’ een nieuwe link aan.</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mailadres</label>
            <input className="input" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Wachtwoord</label>
            <input className="input" id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Inloggen...' : 'Inloggen'}
          </button>
        </form>
        <div className="loginPortalSwitch">
          <strong>Ben je bartender?</strong>
          <p>Gebruik de aparte crewomgeving voor diensten, uren en facturen.</p>
          <Link href="/crew">Open Crewportaal →</Link>
        </div>
        <Link href="/activate" className="textButton">Account activeren</Link>
        <Link href="/forgot-password" className="textButton">Wachtwoord vergeten?</Link>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
