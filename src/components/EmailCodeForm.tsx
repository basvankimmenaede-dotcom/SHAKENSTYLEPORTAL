'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import BrandLogo from '@/components/BrandLogo';
import { authErrorMessage, createCodeClient, normalizeEmail, saveCodePassword, verifyEmailCode, type CodeKind } from '@/lib/email-code';

export default function EmailCodeForm({ recovery = false, invitation = false }: { recovery?: boolean; invitation?: boolean }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [stage, setStage] = useState<'request' | 'verify' | 'password'>(invitation ? 'verify' : 'request');
  const [kind, setKind] = useState<CodeKind>(recovery ? 'recovery' : invitation ? 'invite' : 'email');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const client = useRef<SupabaseClient | null>(null);
  const verified = useRef<{ id: string; email: string } | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  useEffect(() => {
    // Only a non-secret code type is retained; never tokens or passwords.
    const emailMethod = !recovery && new URLSearchParams(window.location.search).get('method') === 'email';
    if (emailMethod) setKind('email');
    // Old invitation URLs may contain credentials. They are not redeemed by this page.
    window.history.replaceState({}, '', window.location.pathname + (emailMethod ? '?method=email' : ''));
  }, [recovery]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function getClient() {
    if (!client.current) client.current = createCodeClient();
    return client.current;
  }

  async function requestCode() {
    const normalized = normalizeEmail(email);
    if (!normalized || inFlight.current || cooldown) return;
    inFlight.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const auth = getClient().auth;
      const result = recovery
        ? await auth.resetPasswordForEmail(normalized)
        : await auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: false } });
      // Unknown accounts receive the same response. This is not public signup.
      if (result.error && !['user_not_found', 'signup_disabled'].includes(result.error.code ?? '')) throw result.error;
      setKind(recovery ? 'recovery' : 'email');
      if (!recovery) window.history.replaceState({}, '', `${window.location.pathname}?method=email`);
      setEmail(normalized); setCode(''); setStage('verify'); setCooldown(60);
      setMessage('Als dit e-mailadres bij ons bekend is, ontvang je een code. Gebruik de nieuwste mail.');
    } catch (err) {
      setError(authErrorMessage(err as { code?: string; status?: number }, 'request'));
    } finally { setBusy(false); inFlight.current = false; }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (stage === 'request') { await requestCode(); return; }
    if (stage === 'password' && (password.length < 8 || password !== confirm)) {
      setError(password.length < 8 ? 'Gebruik minimaal 8 tekens.' : 'De wachtwoorden zijn niet hetzelfde.'); return;
    }
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (stage === 'verify') {
        const normalized = normalizeEmail(email);
        const id = await verifyEmailCode(getClient(), normalized, code, kind);
        verified.current = { id, email: normalized };
        setEmail(normalized); setCode(''); setStage('password');
      } else {
        if (!verified.current) throw new Error('invalid_identity');
        await saveCodePassword(getClient(), verified.current.id, verified.current.email, password);
        // A successful password write must not be reported as failed if logout has a network error.
        await getClient().auth.signOut({ scope: 'local' }).catch(() => undefined);
        verified.current = null; client.current = null; setPassword(''); setConfirm('');
        router.replace(recovery ? '/login?reset=success' : '/login?activated=success');
        router.refresh();
      }
    } catch (err) {
      setError(authErrorMessage(err as { code?: string; status?: number }, stage === 'verify' ? 'verify' : 'password'));
    } finally { setBusy(false); inFlight.current = false; }
  }

  return <main className="loginPage"><section className="loginCard">
    <div className="loginBrand"><BrandLogo dark /></div>
    <Link href="/login" className="eyebrowLink">← Terug naar inloggen</Link>
    <h1>{recovery ? 'Wachtwoord herstellen' : 'Account activeren'}</h1>
    <p className="muted">{stage === 'password' ? `Kies een wachtwoord voor ${email}.` : 'Gebruik de eenmalige code uit je mail. Je hoeft geen activatielink te openen.'}</p>
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}
    <form onSubmit={submit}>
      {stage !== 'password' && <div className="field"><label htmlFor="code-email">E-mailadres</label>
        <input className="input" id="code-email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={e => setEmail(e.target.value)} /></div>}
      {stage === 'verify' && <div className="field"><label htmlFor="email-code">Code uit je mail</label>
        <input className="input" id="email-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required disabled={busy} value={code} onChange={e => setCode(e.target.value.replace(/\s/g, ''))} /></div>}
      {stage === 'password' && <>
        <div className="field"><label htmlFor="new-password">Nieuw wachtwoord</label><input className="input" id="new-password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div className="field"><label htmlFor="confirm-password">Herhaal wachtwoord</label><input className="input" id="confirm-password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      </>}
      <button className="button orange" type="submit" disabled={busy || (stage === 'request' && cooldown > 0)} style={{ width: '100%' }}>{busy ? 'Even geduld...' : stage === 'request' ? 'Stuur een code' : stage === 'verify' ? 'Controleer code' : 'Wachtwoord opslaan'}</button>
    </form>
    {stage === 'verify' && <button className="textButton" type="button" disabled={busy || cooldown > 0 || !email.includes('@')} onClick={() => void requestCode()}>{cooldown ? `Nieuwe code aanvragen over ${cooldown}s` : 'Nieuwe code aanvragen'}</button>}
    {stage === 'password' && error && <button className="textButton" type="button" disabled={busy} onClick={() => { verified.current = null; client.current = null; setPassword(''); setConfirm(''); setStage('request'); setError(''); }}>Nieuwe code aanvragen</button>}
  </section></main>;
}
