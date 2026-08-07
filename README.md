## Nexa Model — Dark Mode Edition

# Nexa Model Web

A lightweight React + Vite starter for Nexa Model.

## Included

- Public fashion/boutique landing page
- Talent login demo
- Private talent progress dashboard
- Responsive layout
- Lightweight built-in client navigation (no React Router dependency)

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Clean installation

If you previously installed an older copy, remove its dependency files first.

### PowerShell

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npm audit
npm run dev
```

The development URL is normally `http://localhost:5173`.

## Routes

- `/` — public website
- `/login` — demo login
- `/portal` — talent dashboard

## Private application review site

The repository contains a separately built admin application in `admin/`. It joins applicant
details and ImageKit photo URLs from D1 so staff can review each submission in one place.

Build it with:

```powershell
npm run build:admin
```

Before the first admin deployment:

1. Apply the admin review migration:

   ```powershell
   npx wrangler d1 execute nexa-production --remote --file migrations/0002_admin_review.sql
   ```

2. Create a Cloudflare Access self-hosted application for the chosen admin subdomain, such as
   `admin.example.com`. Use an Allow policy restricted to the staff email addresses that should
   review applications.
3. Replace the placeholders in `wrangler.admin.jsonc`:
   - `ACCESS_TEAM_DOMAIN` is the Access team domain, without `https://`.
   - `ACCESS_AUD` is the application audience tag shown by Cloudflare Access.
   - `ADMIN_EMAILS` is a comma-separated second allowlist of staff email addresses.
4. Change the development proxy target in `vite.admin.config.js` to the real admin hostname.
5. Deploy the admin Worker and assets:

   ```powershell
   npm run deploy:admin
   ```

6. Add the admin custom domain to the `nexa-model-admin` Worker. Ensure the Cloudflare Access
   application covers the entire admin hostname, including `/api/admin/*`.

The admin Worker cryptographically validates the `Cf-Access-Jwt-Assertion` on every admin API
request and checks both the Access audience and `ADMIN_EMAILS`. Hiding the URL is not treated as
authentication.

## Demo login

Enter any valid email and any password. Authentication is mocked for now.

## Google Form

Replace `https://forms.google.com` in `src/pages/Home.jsx` with the real Nexa Model application form URL.

## Full application form

The `/apply` flow stores core contact information in `applicants`, complete form responses in
`applicant_details`, and categorized ImageKit uploads in `applicant_photos`.

Apply the D1 migration once before deploying this version:

```powershell
npx wrangler d1 execute nexa-production --remote --file migrations/0001_applicant_details.sql
```

## Application confirmation email

The frontend calls `/api/finalize` after every applicant photo has uploaded. The Worker then sends a bilingual confirmation email through Resend. An email outage does not invalidate an application that is already stored.

Verify a sending domain in Resend, then configure the Worker:

```powershell
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_REPLY_TO
```

Suggested values:

```text
EMAIL_FROM=Nexa Model <applications@updates.yourdomain.com>
EMAIL_REPLY_TO=support@yourdomain.com
```

For local development, put the same names in `.dev.vars`. Never commit the Resend API key.

## Production note

When deploying an SPA, configure the host to rewrite unknown routes to `index.html`, so `/login` and `/portal` work after a browser refresh.

## Theme switching

The site now supports light and dark themes. The visitor's choice is saved in localStorage under `nexa-theme`; first-time visitors follow their operating-system preference.
