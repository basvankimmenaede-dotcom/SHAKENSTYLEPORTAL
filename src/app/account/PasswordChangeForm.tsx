'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PasswordChangeForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

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
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message || 'Het wachtwoord kon niet worden gewijzigd.');
        return;
      }

      setPassword('');
      setConfirmPassword('');
      setSuccess('Je wachtwoord is gewijzigd.');
    } catch {
      setError('Het wachtwoord kon niet worden gewijzigd. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="accountPasswordForm">
      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="field">
        <label htmlFor="newPassword">Nieuw wachtwoord</label>
        <input
          id="newPassword"
          className="input"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="confirmNewPassword">Herhaal nieuw wachtwoord</label>
        <input
          id="confirmNewPassword"
          className="input"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      <button type="submit" className="button orange" disabled={loading}>
        {loading ? 'Opslaan...' : 'Wachtwoord wijzigen'}
      </button>
    </form>
  );
}
