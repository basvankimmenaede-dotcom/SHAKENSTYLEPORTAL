import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

type ActivateSearchParams = {
  token_hash?: string;
  type?: string;
  error?: string;
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<ActivateSearchParams>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : '';
  const type = typeof params.type === 'string' ? params.type : '';
  const error = typeof params.error === 'string' ? params.error : '';
  const canActivate = Boolean(tokenHash && type === 'invite');

  const errorMessage = error
    ? error === 'invalid'
      ? 'Deze activatielink is niet compleet. Vraag SHAKENSTYLE om een nieuwe uitnodiging.'
      : 'Deze activatielink is al gebruikt of verlopen. Als je account al actief is, kun je gewoon inloggen.'
    : null;

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="loginBrand"><BrandLogo dark /></div>
        <h1>SHAKENSTYLE Portal</h1>
        <p className="muted">
          Je bent uitgenodigd voor het SHAKENSTYLE Portal. Klik hieronder om je uitnodiging te bevestigen.
        </p>

        {errorMessage ? <div className="error">{errorMessage}</div> : null}

        {!errorMessage && canActivate ? (
          <>
            <div className="notice" style={{ marginBottom: 18 }}>
              Deze extra stap voorkomt dat e-mailbeveiliging je activatielink automatisch gebruikt.
            </div>
            <form method="post" action="/auth/activate">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value="invite" />
              <button className="button orange" type="submit" style={{ width: '100%' }}>
                Account activeren
              </button>
            </form>
          </>
        ) : null}

        {!errorMessage && !canActivate ? (
          <div className="error">Deze activatielink is ongeldig of niet compleet.</div>
        ) : null}

        <Link href="/login" className="textButton">Ik heb al een account</Link>
      </section>
    </main>
  );
}
