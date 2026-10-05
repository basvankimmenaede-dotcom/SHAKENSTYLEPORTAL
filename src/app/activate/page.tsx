'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';

function ActivateBridge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    const code = searchParams.get('code');
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
    const hasInviteHash = hashParams.get('type') === 'invite'
      && Boolean(hashParams.get('access_token'))
      && Boolean(hashParams.get('refresh_token'));

    // SECURITY: never use an already logged-in browser session as an invite.
    // Only explicit invite credentials are forwarded.
    if (tokenHash && type === 'invite') {
      router.replace('/accept-invite?' + searchParams.toString());
      return;
    }
    if (code) {
      router.replace('/accept-invite?' + searchParams.toString());
      return;
    }
    if (hasInviteHash) {
      router.replace('/accept-invite' + hash);
      return;
    }

    setError('Deze uitnodiging bevat geen geldige activatiegegevens. Vraag SHAKENSTYLE om een nieuwe uitnodiging.');
    setChecking(false);
  }, [router, searchParams]);

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <h1>SHAKENSTYLE Portal</h1>

        {checking ? (
          <p className="muted">Je uitnodiging wordt veilig gecontroleerd...</p>
        ) : (
          <>
            <div className="error">{error}</div>
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
