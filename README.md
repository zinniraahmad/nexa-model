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

## Production note

When deploying an SPA, configure the host to rewrite unknown routes to `index.html`, so `/login` and `/portal` work after a browser refresh.

## Theme switching

The site now supports light and dark themes. The visitor's choice is saved in localStorage under `nexa-theme`; first-time visitors follow their operating-system preference.
