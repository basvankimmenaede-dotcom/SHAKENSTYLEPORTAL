'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
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
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('E-mailadres of wachtwoord klopt niet.');
        return;
      }
      router.replace('/');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }



  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <h1>Storage Portal</h1>
        <p className="muted">Log in om jouw opgeslagen merken en materialen te bekijken.</p>
        {searchParams.get('error') === 'profile' ? <div className="error">Je account bestaat, maar heeft nog geen portalprofiel. Neem contact op met SHAKENSTYLE.</div> : null}
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
        <Link href="/forgot-password" className="textButton">Wachtwoord vergeten?</Link>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
