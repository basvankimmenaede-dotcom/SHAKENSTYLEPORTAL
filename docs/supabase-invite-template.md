# Supabase invite template voor scanner-veilige activatie

Gebruik deze inhoud voor **Authentication → Email Templates → Invite user**.

Belangrijk: de e-mail linkt eerst naar onze eigen activatiepagina. De Supabase invite-token wordt pas verbruikt nadat de gebruiker daar zelf op **Account activeren** klikt.

```html
<h2>Welkom bij het SHAKENSTYLE Portal</h2>

<p>Je bent uitgenodigd om toegang te krijgen tot het SHAKENSTYLE Portal.</p>

<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">
    Account activeren
  </a>
</p>

<p>
  Deze link is persoonlijk. Als je deze uitnodiging niet verwachtte, kun je deze e-mail negeren.
</p>
```

De applicatie geeft bij `inviteUserByEmail` als `redirectTo` mee:

```
https://portal.shakenstyle.com/activate
```

Daardoor komt de gebruiker eerst op `/activate`. Een automatische GET door een mail- of securityscanner verbruikt de token daar niet. Alleen de expliciete POST vanaf de knop op de activatiepagina doet `verifyOtp(type: "invite")`.
