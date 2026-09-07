# SHAKENSTYLE Storage Portal

Eerste werkende versie van het SHAKENSTYLE klantportaal.

## In deze versie

- Supabase e-mail/wachtwoord login
- Rollen: `admin` en `customer`
- Beveiligde adminomgeving
- Distributeurs aanmaken
- Klantgebruikers uitnodigen en aan distributeurs koppelen
- Rentman-hoofdmappen synchroniseren
- Per Rentman-map bepalen: merk ja/nee en actief in klantportaal ja/nee
- Merken handmatig aan distributeurs toewijzen
- Klant ziet uitsluitend actieve, toegewezen merken
- Per merk Rentman equipment uitlezen
- Equipment wordt alleen getoond wanneer het ingestelde Rentman custom field waar/ja is
- Responsive SHAKENSTYLE-interface

## Benodigde database

Dit project verwacht de Supabase-tabellen die tijdens de portal-opzet zijn aangemaakt:

- `profiles`
- `distributors`
- `brands`
- `distributor_brands`

En de extra sync-kolommen op `brands`:

- `portal_enabled`
- `is_brand`
- `rentman_name`
- `rentman_path`
- `rentman_parent_id`
- `rentman_active`
- `last_synced_at`
- `updated_at`

De bestaande RLS policies blijven leidend.

## Installeren

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open daarna `http://localhost:3000`.

## Environment variables

Vul `.env.local` lokaal in. Deel de service role key en Rentman API token niet in broncode of chat.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RENTMAN_API_TOKEN=...
RENTMAN_PORTAL_CUSTOM_FIELD_KEY=...
```

### Waar vind je Supabase keys?

Supabase project -> Settings -> API.

- Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
- anon/public key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- service_role -> `SUPABASE_SERVICE_ROLE_KEY`

De service role key is geheim en mag nooit `NEXT_PUBLIC_` krijgen.

### Rentman custom-field key

`RENTMAN_PORTAL_CUSTOM_FIELD_KEY` is de interne API-key van het custom equipment field waarmee je in Rentman bepaalt of een item zichtbaar mag worden in het portaal.

Zolang deze key niet is ingesteld, toont het klantportaal bewust geen Rentman-items.

## Rollen

### SHAKENSTYLE admin

`profiles.role = 'admin'`

Admin kan:

- `/admin`
- `/admin/brands`
- `/admin/distributors`
- Rentman sync uitvoeren
- merken activeren/deactiveren
- merken aan distributeurs koppelen

### Klant

`profiles.role = 'customer'`

Voor een klant moet `profiles.distributor_id` naar een bestaande distributeur verwijzen.

De klant ziet alleen een merk wanneer alle voorwaarden waar zijn:

1. het merk is gekoppeld in `distributor_brands`;
2. `brands.portal_enabled = true`;
3. `brands.is_brand = true`;
4. `brands.rentman_active = true`.

Daarna worden binnen het merk alleen Rentman equipment-items weergegeven waarvan het portal custom field op ja/true staat.

## Rentman sync

In `/admin/brands` staat de knop **Synchroniseer Rentman**.

De serverroute:

`POST /api/admin/sync-rentman-folders`

- haalt equipment-hoofdmappen uit Rentman;
- maakt nieuwe mappen aan in `brands`;
- nieuwe mappen krijgen standaard `portal_enabled = false`;
- bestaande admininstellingen worden niet overschreven;
- mappen die niet meer in Rentman voorkomen krijgen `rentman_active = false`.

## Vercel

Na een eerste test kan deze repository rechtstreeks op Vercel worden gezet. Voeg daar dezelfde environment variables toe via Project Settings -> Environment Variables.

Daarna kan `portal.shakenstyle.com` via een DNS CNAME bij Antagonist aan het Vercel-project worden gekoppeld.

## Nog niet in deze eerste versie

De architectuur is voorbereid, maar deze onderdelen zijn bewust nog niet toegevoegd:

- eindklanten/activatielocaties;
- laatste en volgende inzet per equipment-item;
- meerdere Rentman afbeeldingen als galerij;
- winkelmand en Rentman Project Request;
- automatische periodieke Rentman sync.

Die kunnen op deze basis worden toegevoegd zonder de kernstructuur opnieuw te ontwerpen.

## Password reset / production URL
Set this Vercel environment variable as **Config**:

`NEXT_PUBLIC_APP_URL=https://shakenstyle-portal.vercel.app`

In Supabase -> Authentication -> URL Configuration use:
- Site URL: `https://shakenstyle-portal.vercel.app`
- Redirect URL: `https://shakenstyle-portal.vercel.app/reset-password`
- Optional wildcard: `https://shakenstyle-portal.vercel.app/**`

The password-reset email template should use Supabase's default `{{ .ConfirmationURL }}` link. If a custom email template is used, restore that variable instead of manually concatenating SiteURL and RedirectTo.

## v8 additions
- SHAKENSTYLE black/white/orange base styling and Montserrat typography
- Admin 'Gebruikersweergave' preview link
- Customer cards no longer show Rentman folder numbering
- Equipment cards open a detail page
- Detail page shows last Rentman usage date and dimensions
- Rentman image file references are resolved to actual image URLs
- Favicon points to the live SHAKENSTYLE website favicon


## v8.3 wijzigingen
- Los wachtwoord-vergeten scherm met eigen e-mailveld
- Zoekfunctie op materiaalnaam en itemcode
- Compacte vaste itemafbeeldingen
- SHAKENSTYLE-logo in header/login
- Gebruikersinterface gebruikt “in beheer” in plaats van leveranciersnaam
- Klantportaal toont distributeursnaam als portaalnaam
