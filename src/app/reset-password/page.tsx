'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password.length < 8) { setError('Gebruik minimaal 8 tekens voor je nieuwe wachtwoord.'); return; }
    if (password !== confirmPassword) { setError('De wachtwoorden zijn niet hetzelfde.'); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Je resetlink is ongeldig of verlopen. Vraag een nieuwe resetmail aan.'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError('Het wachtwoord kon niet worden gewijzigd. Vraag eventueel een nieuwe resetmail aan.'); return; }
      await supabase.auth.signOut();
      router.replace('/login?reset=success'); router.refresh();
    } finally { setLoading(false); }
  }

  return <main className="loginPage"><section className="loginCard">
    <div className="loginLogo">SHAKEN<span>STYLE</span></div>
    <h1>Nieuw wachtwoord</h1>
    <p className="muted">Kies een nieuw wachtwoord voor je Storage Portal-account.</p>
    {error ? <div className="error">{error}</div> : null}
    <form onSubmit={submit}>
      <div className="field"><label htmlFor="password">Nieuw wachtwoord</label><input className="input" id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div className="field"><label htmlFor="confirmPassword">Herhaal wachtwoord</label><input className="input" id="confirmPassword" type="password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
      <button className="button orange" type="submit" disabled={loading} style={{ width: '100%' }}>{loading ? 'Opslaan...' : 'Wachtwoord wijzigen'}</button>
    </form>
  </section></main>;
}
