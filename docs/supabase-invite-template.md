# Email codes for activation and password recovery

Deploy the application and configure these templates together. Do not enable the new pages in production before templates contain the code. Existing accounts, profiles, and permissions are preserved. Never confirm users manually or set a shared password.

## Authentication → Email Templates

### Invite user
Subject: `Activeer je SHAKENSTYLE-account`

```html
<h2>Welkom bij SHAKENSTYLE</h2>
<p>Je bent uitgenodigd voor het SHAKENSTYLE Portal.</p>
<p>Open zelf https://portal.shakenstyle.com/accept-invite en vul je e-mailadres en deze eenmalige code in:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Daarna kies je je wachtwoord. De code is 10 minuten geldig. Deel deze code met niemand.</p>
<p>Heb je dit niet verwacht? Dan kun je deze mail negeren.</p>
```

### Magic Link (used by Account activeren → Stuur een code)
Subject: `Je SHAKENSTYLE-activatiecode`

```html
<h2>Je SHAKENSTYLE-code</h2>
<p>Vul deze eenmalige code in op de pagina waar je de code hebt aangevraagd:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>De code is 10 minuten geldig. Gebruik de nieuwste mail. Deel deze code met niemand.</p>
<p>Pagina gesloten? Open https://portal.shakenstyle.com/activate en vraag een nieuwe code aan.</p>
<p>Heb je geen code aangevraagd? Dan kun je deze mail negeren.</p>
```

### Reset password
Subject: `Herstel je SHAKENSTYLE-wachtwoord`

```html
<h2>Wachtwoord herstellen</h2>
<p>Vul deze eenmalige code in op het portaal om een nieuw wachtwoord te kiezen:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Open zo nodig zelf https://portal.shakenstyle.com/reset-password en vul je e-mailadres en de code in.</p>
<p>De code is 10 minuten geldig. Gebruik de nieuwste mail. Deel deze code met niemand.</p>
<p>Heb je dit niet aangevraagd? Dan kun je deze mail negeren. Je wachtwoord is niet gewijzigd.</p>
```

No template may contain `.ConfirmationURL`, `.TokenHash`, or a token in a URL. Plain portal URLs are harmless for scanners. Old links lead to a page where users can request a code; they are never automatically redeemed.

## Auth settings required before release

- Email OTP Expiration: **600 seconds** (currently more than one hour; must be shortened).
- Email OTP Length: **8 digits**, if supported by the hosted Auth configuration. UI accepts 6–10 digits.
- Preserve server-enforced email-send and `/verify` rate limits; verify they are enabled. The 60-second resend countdown in the UI is only a convenience, never a security boundary.
- Check the configured email provider can deliver to the test mailbox and Pernod Ricard.

## Acceptance checks before production release

1. Invite a dedicated test account; use the invitation's code on `/accept-invite`.
2. For an existing unconfirmed test account, request a code on `/activate`. No new account is created (`shouldCreateUser: false`).
3. Verify an incorrect/expired code cannot open the password stage. Verify throttling at the configured Auth limit. Resend and use the newest code.
4. Set a password, observe success only after the write, then sign in through `/login` using that password. Confirm correct profile/rights.
5. Repeat with `/forgot-password` and with an admin-initiated reset arriving on `/reset-password`.
6. Verify a used code cannot be reused, including after refresh. Refreshing password setup requires a fresh code.
7. Repeat while another user/admin is signed in; only the verified account's password may change, and the existing cookie session must remain untouched.
8. Visiting/scanning the plain email URLs must not activate an account or consume a code.

Local tests (`npm run test:auth`) cover client isolation, identity guards, failure propagation, and error messages with mocked Auth responses. They do not establish actual email delivery or hosted OTP expiry/replay/rate-limit enforcement. Hosted acceptance checks remain mandatory.
