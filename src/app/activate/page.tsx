'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { createClient } from '@/lib/supabase/client';

function ActivateBridge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const tokenHash = searchParams.get('token_hash') ?? '';
  const type = searchParams.get('type') ?? '';
  const code = searchParams.get('code');

  useEffect(() => {
    if (tokenHash && type === 'invite') {
      setChecking(false);
      return;
    }

    let active = true;
    async function continueExistingInvite() {
      const supabase = createClient();

      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          router.replace('/accept-invite');
          return;
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError) {
            router.replace('/accept-invite');
            return;
          }
        }

        // Standard Supabase invite links may return the session in the URL hash.
        // Give the browser client time to process that hash before showing recovery UI.
        await new Promise((resolve) => setTimeout(resolve, 900));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace('/accept-invite');
          return;
        }

        if (active) {
          setError('Deze link kan niet meer worden gebruikt. Je account is mogelijk al geactiveerd of er is inmiddels een nieuwere uitnodiging verstuurd.');
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    void continueExistingInvite();
    return () => { active = false; };
  }, [code, router, tokenHash, type]);

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <h1>SHAKENSTYLE Portal</h1>

        {checking ? (
          <>
            <p className="muted">Je uitnodiging wordt gecontroleerd...</p>
            <p className="muted">Een moment geduld.</p>
          </>
        ) : tokenHash && type === 'invite' ? (
          <>
            <p className="muted">Je bent uitgenodigd voor het SHAKENSTYLE Portal.</p>
            <form method="post" action="/auth/activate">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value="invite" />
              <button className="button orange" type="submit" style={{ width: '100%' }}>
                Account activeren
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="error">
              {error || 'Deze link kan niet meer worden gebruikt.'}
            </div>
            <div className="activationRecoveryActions">
              <Link href="/login" className="button orange">Inloggen</Link>
              <a
                href="mailto:info@shakenstyle.com?subject=Nieuwe%20uitnodiging%20SHAKENSTYLE%20Portal"
                className="button secondary"
              >
                Hulp nodig?
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function ActivatePage() {
  return <Suspense fallback={null}><ActivateBridge /></Suspense>;
}
