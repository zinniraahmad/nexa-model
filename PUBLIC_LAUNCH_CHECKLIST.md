# Nexa Model Public Launch Checklist

Last reviewed: 8 August 2026

## Release decision

**Status: TECHNICAL AND OPERATIONAL LAUNCH BLOCKERS COMPLETE. HOLD public promotion until the final go-live gate and named launch approval below are complete.**

The homepage is already reachable at `https://nexa-model.com` and the deployed asset hashes match the current local production build. Treat the site as publicly exposed while completing this checklist.

## Launch blockers

- [x] Make the mobile hamburger menu functional, including open/close state, keyboard support, focus handling and navigation links.
- [x] Enable a permanent HTTP-to-HTTPS redirect using **SSL/TLS → Edge Certificates → Always Use HTTPS**. Verified in production on 8 August 2026: HTTP returns `301`, paths and query strings are preserved, and HTTPS completes with a valid certificate and no redirect loop.
- [x] Use `nexa-model.com` as the canonical hostname and redirect `www.nexa-model.com` with a method-preserving `308`. Verified in production on 8 August 2026: root, paths, query strings and POST requests redirect correctly without loops.
- [x] Align the homepage promise with the application requirements. The production homepage now advises 20–30 minutes; the shared form/API schema requires at least 19 photos and permits up to 26. Verified live on 8 August 2026.
- [x] Prevent expired pending applications from being replaced using only a known email address and Turnstile. Production now requires the existing upload token or an emailed, single-use recovery token (valid for 60 minutes) before answers or uploaded photos can be replaced; tokens are hashed, rotated atomically and covered by regression tests.
- [x] Stop applicant-status/email enumeration. Section 1 now sends all valid access requests through a secure email flow and returns the same public `202` status/body whether the address is new, has a pending upload or has already submitted. Only the mailbox owner receives the applicable instruction. Verified in production on 8 August 2026.
- [x] Reject oversized JSON and multipart requests before fully parsing them. Route-specific limits now check declared size and cap streamed bytes before calling `JSON.parse()` or `formData()`; post-parse schema and 10 MB image checks remain as defence in depth. Regression-tested and production `413` verified on 8 August 2026.
- [x] Complete the bilingual Privacy Notice implementation review against Malaysia's PDPA requirements. The notice identifies Zinnira Ahmad as the data controller and publishes general/privacy electronic contacts, technical data and sources, mandatory/optional fields and consequences, Cloudflare/ImageKit/Resend/WhatsApp/Google Drive disclosures, overseas processing, rights and complaint handling, and current breach-notification commitments. Reviewed against official Act 709, Amendment Act A1727 and Commissioner guidance on 8 August 2026; the final English/BM controller wording was verified in production without business-registration commentary. Obtain Malaysian legal advice if a formal compliance opinion is required.

## Important before accepting applications

- [x] Add explicit `Cache-Control: no-store, max-age=0`, `Pragma: no-cache` and consistent CSP, cross-origin resource, permissions, referrer, MIME-sniffing and frame protections to every public/admin JSON response, including auth failures and admin session/list/detail responses. Regression-tested, deployed to both Workers and public production headers verified on 8 August 2026; unauthenticated admin traffic remains intercepted with `no-store` by Cloudflare Access.
- [x] Formally assign the six-month retention review to Zinnira Ahmad. The documented runbook requires a weekly admin review, deletion or a recorded reason/next-review date, a review log even when no records are due, and same-day escalation for blocked overdue deletion. The application continues to warn 30 days before the six-month date; automatic deletion is deliberately not enabled without a human decision.
- [x] Document and test the applicant access, correction, consent-withdrawal and deletion-request workflow before collecting production records. The bilingual intake/verification expectations and access, correction, withdrawal and deletion steps are assigned to Zinnira Ahmad in `docs/APPLICANT_RIGHTS_RUNBOOK.md`; the 8 August 2026 tabletop passed and the successful-deletion path was proven using the authorized synthetic production record described below.
- [x] Create a data-breach response procedure owned by Zinnira Ahmad with primary/backup and provider escalation contacts, containment and evidence-preservation controls, Malaysia PDPA significant-harm/72-hour assessment, affected-person communication, recovery and a completed tabletop exercise. See `docs/DATA_BREACH_RESPONSE_PLAN.md`.
- [x] Perform an end-to-end production application test using authorized test data. On 8 August 2026, synthetic application `5b6ef911-0387-41b8-b808-397fbfc86ee7` passed Turnstile, D1 creation, all 19 required private ImageKit uploads, finalization and confirmation-email delivery. The MFA-protected admin displayed 19 five-minute signed image links and a signed asset opened successfully. Admin deletion completed, all three D1 table counts returned zero and the previously signed ImageKit URL returned `404`. No real applicant data was used.
- [x] Verify Cloudflare Access membership and require MFA for every administrator. On 8 August 2026, the `onlyadmin` self-hosted application had one `Admin Only` policy allowing only `itszinniraahmad@gmail.com`; the App Launcher was restricted to that same policy; global independent MFA enforcement was enabled with biometrics, security key and authenticator-application methods on a 24-hour duration; and the sole administrator enrolled an authenticator application and successfully completed a live TOTP challenge before the admin dashboard loaded. `wrangler.admin.jsonc` independently restricts the Worker to the same email through `ADMIN_EMAILS`.
- [x] Document D1 backup/recovery and complete an isolated local restoration drill using one synthetic applicant only. The 8 August 2026 drill restored and verified one row in each applicant/details/photos table, recorded the backup SHA-256 checksum and securely removed temporary artifacts. See `docs/D1_RECOVERY_RUNBOOK.md` and `scripts/d1-recovery-drill.ps1`.

## SEO, trust and usability

- [ ] Add a real `/robots.txt`; it currently returns the SPA HTML.
- [ ] Add `/sitemap.xml` for `/`, `/apply` and `/privacy`; it currently returns the SPA HTML.
- [ ] Add favicon/app icons; `/favicon.ico` currently returns the SPA HTML.
- [ ] Add Open Graph and social-sharing metadata, plus an absolute canonical URL.
- [ ] Return a genuine not-found experience for unknown routes instead of silently replacing them with the homepage and `200 OK`.
- [ ] Replace the personal Gmail address with a domain mailbox such as `privacy@nexa-model.com` or `hello@nexa-model.com`, while retaining a monitored fallback.
- [ ] Fix the age wording mismatch: English says “below 30,” Malay and server validation include age 30.
- [ ] Check colour contrast, keyboard navigation, screen-reader names and reduced-motion behaviour across the homepage, application and privacy notice.
- [ ] Add monitoring alerts for elevated `4xx`/`5xx`, rate-limit events, Turnstile failures, ImageKit/Resend failures and unusual admin activity.
- [ ] Enable DNSSEC at the registrar/Cloudflare when operationally ready; no DS record was found during this review.

## Dependency follow-up

- [x] Production dependency audit: `npm audit --omit=dev` reports 0 known vulnerabilities.
- [ ] Track the current development-tool advisories. A full `npm audit` reports 7 transitive advisories in Vite/Wrangler tooling (2 moderate, 5 high) with no available fix at review time. They are not included in the deployed browser bundle, but should be rechecked when updates are released.
- [ ] Update Wrangler from 4.119.0 to a supported patched release after testing; 4.120.0 was available at review time.

## Verified on 8 August 2026

- [x] Public and admin production builds complete successfully.
- [x] All 11 public security regression tests pass, including uniform application-access responses, replacement authorization, single-use tokens, pre-parse request-size enforcement, API security headers and required Privacy Notice disclosures.
- [x] No tracked `.env`, `.dev.vars`, private-key or credential file was found.
- [x] Public Worker secret names are configured for Turnstile, ImageKit, Resend and confirmation-email settings; secret values were not read.
- [x] Admin Worker has its ImageKit private-key secret configured.
- [x] Production D1 has migrations 0001–0006 and all expected security indexes, recovery-token columns and the single-use application-access table.
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

- [ ] Re-run `npm test`, `npm run build:all`, `npm audit --omit=dev` and `git diff --check` from a clean worktree.
- [ ] Re-test desktop and mobile navigation against the production hostname.
- [ ] Re-check HTTP/canonical redirects, security headers, `robots.txt`, sitemap, favicon and unknown-route handling in production.
- [x] Confirm the application end-to-end test and deletion test passed on 8 August 2026 using authorized synthetic data; D1 and ImageKit post-deletion checks found no retained test record or image.
- [ ] Record launch approval, responsible owner and rollback decision here.

Approval: ____________________  Date: ____________________  Rollback owner: ____________________
