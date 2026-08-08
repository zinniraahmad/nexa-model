## Nexa Model — Dark Mode Edition

# Nexa Model Web

A lightweight React + Vite starter for Nexa Model.

Before promoting the production site, complete the [Public Launch Checklist](./PUBLIC_LAUNCH_CHECKLIST.md).

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
- `/apply` — public model application form
- `/privacy` — bilingual Privacy Notice

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

### Public form security

Before exposing `/apply` publicly, apply the security migration:

```powershell
npx wrangler d1 execute nexa-production --remote --file migrations/0003_public_submission_security.sql
npx wrangler d1 execute nexa-production --remote --file migrations/0004_confirmation_email.sql
npx wrangler d1 execute nexa-production --remote --file migrations/0005_application_recovery.sql
npx wrangler d1 execute nexa-production --remote --file migrations/0006_application_access.sql
npx wrangler d1 execute nexa-production --remote --file migrations/0007_browser_intake_confirmation.sql
npx wrangler d1 execute nexa-production --remote --file migrations/0008_restore_single_application_receipt.sql
npx wrangler d1 execute nexa-production --remote --file migrations/0009_admin_submission_notification.sql
```

Create a Cloudflare Turnstile widget in Managed mode for the production hostname, then configure
both keys as Worker secrets. The site key is public by design, but storing both values through the
same deployment mechanism avoids putting environment-specific configuration in Git.

```powershell
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

For local development, add the same names to `.dev.vars`. The Worker verifies every application
with Turnstile, applies Cloudflare rate-limit bindings, issues a two-hour single-use browser intake
token and a one-hour application-scoped upload token, validates PNG/JPEG signatures, and enforces
every form field and photo slot server-side. The first section does not send email. After Turnstile,
the backend checks whether the email already has an application: an existing email receives the
already-submitted landing page, while a new email receives an opaque session token and may continue.
The Final Declaration renders a second, independent Turnstile challenge, and `/api/apply` verifies
that second token before creating any D1 record. The database enforces one application per
case-insensitive email address. JSON and
multipart request bodies are size-limited while
streaming and are rejected before JSON or form-data parsing when they exceed their route limit.
New candidate photos are marked private in ImageKit. The admin Worker returns five-minute signed
URLs and therefore needs its own copy of the ImageKit private key:

```powershell
npx wrangler secret put IMAGEKIT_PRIVATE_KEY --config wrangler.admin.jsonc
```

Run the security regression tests with:

```powershell
npm test
```

The form requires explicit acceptance of the bilingual Privacy Notice. Nexa Model keeps submitted
candidate records for up to six months. The admin review list starts showing a retention warning
30 days before the review date; deletion remains a deliberate staff action and removes both the D1
record and its ImageKit files.

## Application receipt email

The frontend calls `/api/finalize` after every applicant photo has uploaded. Finalization moves the
record directly to `submitted` and sends one bilingual submission receipt without an action link. The
send timestamp is recorded in D1 so a successful send is not intentionally repeated, and a stable
Resend idempotency key prevents concurrent/retried finalization requests from creating duplicate email
within Resend's idempotency window. A separate idempotent notification is sent to
`ADMIN_NOTIFICATION_EMAIL` with the applicant's name, preferred name, age, location, application ID,
submission time and `ADMIN_PORTAL_URL`. It contains no photos; an admin-notification failure is logged
but does not reverse or fail an otherwise successful candidate submission.

Verify a sending domain in Resend, then configure the Worker:

```powershell
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_REPLY_TO
```

Suggested values:

```text
EMAIL_FROM=Nexa Model <applications@updates.yourdomain.com>
EMAIL_REPLY_TO=itszinniraahmad@gmail.com
```

For local development, put the same names in `.dev.vars`. Never commit the Resend API key.

## Production note

When deploying an SPA, configure the host to rewrite unknown routes to `index.html`, so `/login` and `/portal` work after a browser refresh.

## Theme switching

The site now supports light and dark themes. The visitor's choice is saved in localStorage under `nexa-theme`; first-time visitors follow their operating-system preference.
