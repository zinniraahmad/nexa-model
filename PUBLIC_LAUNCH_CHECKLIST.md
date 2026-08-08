# Nexa Model Public Launch Checklist

Last reviewed: 8 August 2026

## Release decision

**Status: APPROVED FOR PUBLIC PROMOTION. All required launch blockers and final go-live gates are complete.**

The homepage is already reachable at `https://nexa-model.com` and the deployed asset hashes match the current local production build. Treat the site as publicly exposed while completing this checklist.

## Launch blockers

- [x] Make the mobile hamburger menu functional, including open/close state, keyboard support, focus handling and navigation links.
- [x] Enable a permanent HTTP-to-HTTPS redirect using **SSL/TLS → Edge Certificates → Always Use HTTPS**. Verified in production on 8 August 2026: HTTP returns `301`, paths and query strings are preserved, and HTTPS completes with a valid certificate and no redirect loop.
- [x] Use `nexa-model.com` as the canonical hostname and redirect `www.nexa-model.com` with a method-preserving `308`. Verified in production on 8 August 2026: root, paths, query strings and POST requests redirect correctly without loops.
- [x] Align the homepage promise with the application requirements. The production homepage now advises 20–30 minutes; the shared form/API schema requires at least 19 photos and permits up to 26. Verified live on 8 August 2026.
- [x] Restore one application per case-insensitive email address. Migration `0008_restore_single_application_receipt.sql` was applied on 8 August 2026 after confirming zero duplicate-email groups; the unique-email index is active, the one `pending_email` test record was promoted and production now has zero `pending_email` records.
- [x] Document the owner-approved applicant-status/email-enumeration trade-off for the restored flow. After Turnstile, Section 1 tells the visitor whether that email already has an application and displays the already-submitted landing page. This deliberately does not satisfy the earlier anti-enumeration control.
- [x] Deploy the restored one-receipt public/admin flow. A new email receives a two-hour browser token and may continue; an existing email is stopped; completed uploads move directly to `submitted`; and Resend sends one idempotent bilingual receipt without an action link. Both Workers were deployed on 8 August 2026; direct `/apply` and `/privacy` return `200`, unknown routes return `404`, and `www` preserves paths/queries with `308`. A fresh full form/receipt/deletion test remains required below.
- [x] Deploy and verify a second independent Turnstile challenge at the Final Declaration. The backend rejects `/api/apply` before D1 creation when this final token is missing, invalid, expired or already used; the first Turnstile remains responsible for the existing-email check. Deployed in public Worker version `7beaf7a4-5720-4481-940a-d5c8a97291d8` on 8 August 2026; `/apply` returns `200` and the live asset contains the final verification UI.
- [x] Verify delivery of the separate admin submission notification with one authorized application. Confirmed by the owner on 8 August 2026 using a real, authorized candidate submission: the candidate received the submission receipt and the owner received the separate admin notification. The implementation is live in public Worker version `52428aa6-9ec7-45aa-9ee3-d4bb5e7343dc`; it uses its own idempotency key, contains only the approved summary fields and MFA-protected admin link, never includes photos, and does not fail the candidate submission if admin delivery fails. No candidate identity or application data is recorded in this checklist.
- [x] Reject oversized JSON and multipart requests before fully parsing them. Route-specific limits now check declared size and cap streamed bytes before calling `JSON.parse()` or `formData()`; post-parse schema and 10 MB image checks remain as defence in depth. Regression-tested and production `413` verified on 8 August 2026.
- [x] Complete the bilingual Privacy Notice implementation review against Malaysia's PDPA requirements. The notice identifies Zinnira Ahmad as the data controller and publishes general/privacy electronic contacts, technical data and sources, mandatory/optional fields and consequences, Cloudflare/ImageKit/Resend/WhatsApp/Google Drive disclosures, overseas processing, rights and complaint handling, and current breach-notification commitments. Reviewed against official Act 709, Amendment Act A1727 and Commissioner guidance on 8 August 2026; the final English/BM controller wording was verified in production without business-registration commentary. Obtain Malaysian legal advice if a formal compliance opinion is required.

## Important before accepting applications

- [x] Add explicit `Cache-Control: no-store, max-age=0`, `Pragma: no-cache` and consistent CSP, cross-origin resource, permissions, referrer, MIME-sniffing and frame protections to every public/admin JSON response, including auth failures and admin session/list/detail responses. Regression-tested, deployed to both Workers and public production headers verified on 8 August 2026; unauthenticated admin traffic remains intercepted with `no-store` by Cloudflare Access.
- [x] Formally assign the six-month retention review to Zinnira Ahmad. The documented runbook requires a weekly admin review, deletion or a recorded reason/next-review date, a review log even when no records are due, and same-day escalation for blocked overdue deletion. The application continues to warn 30 days before the six-month date; automatic deletion is deliberately not enabled without a human decision.
- [x] Document and test the applicant access, correction, consent-withdrawal and deletion-request workflow before collecting production records. The bilingual intake/verification expectations and access, correction, withdrawal and deletion steps are assigned to Zinnira Ahmad in `docs/APPLICANT_RIGHTS_RUNBOOK.md`; the 8 August 2026 tabletop passed and the successful-deletion path was proven using the authorized synthetic production record described below.
- [x] Create a data-breach response procedure owned by Zinnira Ahmad with primary/backup and provider escalation contacts, containment and evidence-preservation controls, Malaysia PDPA significant-harm/72-hour assessment, affected-person communication, recovery and a completed tabletop exercise. See `docs/DATA_BREACH_RESPONSE_PLAN.md`.
- [x] Perform an end-to-end production application test using authorized test data. On 8 August 2026, synthetic application `5b6ef911-0387-41b8-b808-397fbfc86ee7` passed Turnstile, D1 creation, all 19 required private ImageKit uploads, finalization and confirmation-email delivery. The MFA-protected admin displayed 19 five-minute signed image links and a signed asset opened successfully. Admin deletion completed, all three D1 table counts returned zero and the previously signed ImageKit URL returned `404`. No real applicant data was used.
- [x] Complete cleanup verification for the restored-flow production test. The owner confirmed on 8 August 2026 that the retained test candidate was deleted through the admin workflow, its D1 application data no longer remains and all associated ImageKit images were removed. ImageKit retained only an empty folder containing no candidate files or personal data, which is acceptable and does not block launch.
- [x] Verify Cloudflare Access membership and require MFA for every administrator. On 8 August 2026, the `onlyadmin` self-hosted application had one `Admin Only` policy allowing only `itszinniraahmad@gmail.com`; the App Launcher was restricted to that same policy; global independent MFA enforcement was enabled with biometrics, security key and authenticator-application methods on a 24-hour duration; and the sole administrator enrolled an authenticator application and successfully completed a live TOTP challenge before the admin dashboard loaded. `wrangler.admin.jsonc` independently restricts the Worker to the same email through `ADMIN_EMAILS`.
- [x] Document D1 backup/recovery and complete an isolated local restoration drill using one synthetic applicant only. The 8 August 2026 drill restored and verified one row in each applicant/details/photos table, recorded the backup SHA-256 checksum and securely removed temporary artifacts. See `docs/D1_RECOVERY_RUNBOOK.md` and `scripts/d1-recovery-drill.ps1`.

## SEO, trust and usability

- [x] Serve a real `/robots.txt` with the production sitemap URL. Verified live on 8 August 2026.
- [x] Serve `/sitemap.xml` for `/`, `/apply` and `/privacy`. Verified live on 8 August 2026.
- [x] Complete favicon/app-icon coverage. SVG, ICO, 180 px Apple touch and 192 px PNG assets are included, referenced and deployed in public Worker version `52428aa6-9ec7-45aa-9ee3-d4bb5e7343dc`. All three new binary endpoints returned `200` with the correct image content type on 8 August 2026.
- [x] Add Open Graph and social-sharing metadata, plus an absolute canonical URL. Verified in the live homepage HTML on 8 August 2026.
- [x] Return a genuine `404`/`noindex` experience for unknown routes instead of replacing them with the homepage. Verified live on 8 August 2026.
- [x] Replace the public personal Gmail address with `hello@nexa-model.com` while retaining `itszinniraahmad@gmail.com` as the monitored owner fallback and approved privacy contact. Cloudflare Email Routing forwards the active domain route to that verified destination; the inaccessible pending `mynexamodel@gmail.com` destination was removed on 8 August 2026.
- [x] Align the English/Malay age wording and server validation at 18–30 inclusive. Regression-tested and deployed.
- [x] Check colour contrast, keyboard navigation, screen-reader names and reduced-motion behaviour across the homepage, application and privacy notice. All three routes scored 100/100 in a Lighthouse WCAG accessibility audit on 8 August 2026; skip navigation, landmarks, application heading/progress semantics, mobile-menu focus handling and custom-select keyboard behavior were added. See `docs/ACCESSIBILITY_AUDIT.md`.
- [x] Activate monitoring for Worker errors, rate limits, Turnstile, ImageKit, Resend and unusual admin activity. Worker Observability, full invocation/application logging, 10% traces and privacy-safe structured provider/security signals are live in public Worker `52428aa6-9ec7-45aa-9ee3-d4bb5e7343dc` and admin Worker `ec719b77-6d46-43fe-b6ec-3f5c28fac55d`, with an assigned review in `docs/MONITORING_RUNBOOK.md`. The live dashboard was receiving events with zero errors at verification time.
- [ ] Add automatic notifications for the monitored failure signals. The current Cloudflare account exposes no Worker-error notification type, so automatic notification remains unavailable on the present plan; the assigned dashboard review is the active fallback.
- [x] Enable DNSSEC at the registrar/Cloudflare. Enabled through Cloudflare on 8 August 2026; the parent `.com` zone now publishes a DS record for `nexa-model.com` using algorithm 13 and digest type 2.

## Dependency follow-up

- [x] Production dependency audit: `npm audit --omit=dev` reports 0 known vulnerabilities.
- [x] Track and remediate the development-tool advisories. The seven initially tracked transitive advisories were cleared once patched dependency paths became available: Vite 8.2.1, Wrangler 4.120.0, Miniflare 5.20260801.1-alpha, Undici 7.29.0 and Nano ID 3.3.18 are installed. Both the production-only and full `npm audit` now report 0 known vulnerabilities. Zinnira Ahmad owns the weekly and pre-deployment review documented in `docs/DEPENDENCY_MONITORING.md`.
- [x] Update Wrangler from 4.119.0 to the patched 4.120.0 release and rerun the full test/build/audit suite.

## Verified on 8 August 2026

- [x] Public and admin production builds complete successfully.
- [x] All 13 public security regression tests pass locally, including separate first-stage and final-submission Turnstile enforcement, no pre-application Resend call, direct submission, one-time receipt email, pre-parse request-size enforcement, API security headers, Privacy Notice disclosures and direct SPA routing.
- [x] No tracked `.env`, `.dev.vars`, private-key or credential file was found.
- [x] Public Worker secret names are configured for Turnstile, ImageKit, Resend and receipt-email settings; secret values were not read.
- [x] Admin Worker has its ImageKit private-key secret configured.
- [x] Production D1 has migrations 0001–0006 and all expected security indexes, recovery-token columns and the single-use application-access table.
- [x] Apply migration `0007_browser_intake_confirmation.sql` to production D1 immediately before deploying the matching public and admin Workers. Applied and verified on 8 August 2026: the unique-email index is absent, the browser-intake table and four supporting indexes exist, and all three confirmation columns are present. Cloudflare recovery bookmark: `0000003a-00000006-000050c1-9e6f20206d28bcab8c6681ea4c82ff9e`.
- [x] Apply and verify migration `0008_restore_single_application_receipt.sql`. Production recovery bookmark: `00000040-00000006-000050c1-0b9bc96b69614e623b4a70ea84c4edd4`.
- [x] Apply and verify migration `0009_admin_submission_notification.sql`. Production recovery bookmark: `0000004c-00000006-000050c1-b902bdbf51c670ab258850ab252006d0`.
- [x] Production `/api/config` returns a configured Turnstile site key with `Cache-Control: no-store`.
- [x] Admin hostname is protected by Cloudflare Access before the admin application loads.
- [x] Admin API independently validates Access JWT signature, issuer, audience, expiry and the staff email allowlist.
- [x] The public form has server-side schema validation, prepared SQL, Turnstile, rate limits, hashed one-hour upload tokens, declared photo slots and PNG/JPEG signature checks.
- [x] Applicant photos are uploaded as private ImageKit files and admin delivery uses five-minute signed URLs.
- [x] Static responses include CSP, HSTS, clickjacking, MIME-sniffing, referrer and permissions protections.
- [x] Desktop homepage and unavailable-login page render without browser-console errors; all observed homepage images load.
- [x] Mobile homepage has no horizontal overflow at 390 px.
- [x] `/login` and direct `/portal` access show the unavailable page with no login form or password field.
- [x] Live deployment asset hashes match the locally reviewed production build.

## Final go-live gate

- [x] Re-run `npm test`, `npm run build:all`, `npm audit --omit=dev` and `git diff --check` from a clean worktree. Completed on 8 August 2026: all 13 tests and both builds passed, the production dependency audit reported zero vulnerabilities, the diff check passed and the worktree remained clean.
- [x] Re-test desktop and mobile navigation against the production hostname. Completed on 8 August 2026: homepage and application routes rendered without console errors; the 390 px layouts had no horizontal overflow; and the mobile hamburger opened and closed correctly in light mode.
- [x] Re-check HTTP/canonical redirects, security headers, `robots.txt`, sitemap, favicon and unknown-route handling in production. Completed on 8 August 2026: redirects preserve paths/queries, security and no-store headers are present, crawl files and SVG/ICO/Apple/192 px icons respond correctly, and unknown routes return `404`/`noindex`.
- [x] Confirm the application end-to-end test and deletion test passed on 8 August 2026 using authorized synthetic data; D1 and ImageKit post-deletion checks found no retained test record or image.
- [x] Record launch approval, responsible owner and rollback decision here.

Approval: ___Mav____  Date: ___8/8/2026________  Rollback owner: ___Mav______
