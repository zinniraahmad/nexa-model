# Production monitoring runbook

Deployed on 8 August 2026 in public Worker version `52428aa6-9ec7-45aa-9ee3-d4bb5e7343dc` and admin Worker version `ec719b77-6d46-43fe-b6ec-3f5c28fac55d`.

Owner: Zinnira Ahmad  
Review frequency: daily during launch week, then weekly  
Escalation mailbox: `hello@nexa-model.com` (forwards to the direct owner fallback `itszinniraahmad@gmail.com`)

## Active telemetry

Both `nexa-model` and `nexa-model-admin` have Cloudflare Worker Observability enabled with invocation logs at 100%, application logs at 100% and trace sampling at 10%.

The admin Worker also records privacy-minimised operational failures in D1. Three failures for `admin_api` or `imagekit` within five minutes create one alert and send an email to `OPERATIONS_ALERT_EMAIL` (falling back to the configured admin email). Alerts have a 15-minute cooldown to prevent an email storm. If D1 itself is unavailable, an admin API error triggers a direct fallback email. Configure `RESEND_API_KEY` and optionally `OPERATIONS_ALERT_EMAIL` as Worker secrets/variables before deployment.

The public Worker emits structured event names that can be searched in Cloudflare Observability without logging applicant email addresses, phone numbers, Turnstile tokens or provider credentials:

- `security.rate_limited`
- `security.turnstile_token_rejected`
- `security.turnstile_verification_failed`
- `provider.turnstile_not_configured`
- `provider.turnstile_request_failed`
- `provider.imagekit_not_configured`
- `provider.imagekit_upload_failed`
- `provider.imagekit_upload_exception`
- `provider.imagekit_deletion_failed`
- `provider.resend_not_configured`
- `provider.resend_request_failed`
- `application.submission_receipt_not_sent`
- `application.admin_notification_not_sent`

## Review procedure

1. Open Cloudflare **Workers & Pages → Observability** and search the previous review period for `level:error`, `provider.`, `security.turnstile_verification_failed` and `security.rate_limited`.
2. Check Worker invocation outcomes and HTTP status distributions for both Workers. Investigate any elevated 5xx rate or repeated 502/503 response.
3. Check Turnstile analytics for a material change in challenge solve/failure rate.
4. Check ImageKit usage/errors and Resend delivery/bounce dashboards. Reconcile successful application submissions with `confirmation_sent_at` and `admin_notification_sent_at` in D1.
5. Record the review date, reviewer, event counts and any action taken. Escalate provider errors or repeated failures the same day.

Cloudflare account Notifications currently exposes no Worker-error notification type for this account, so the Worker-level email alert, provider-specific structured logs and the assigned review are the active controls. If Worker log alerts become available on the account plan, add an immediate platform alert for any `level:error` provider event and a five-minute threshold alert for elevated 5xx responses as an independent second channel.

Admin logs must use the shared sanitised logger. Do not add request bodies, tokens, applicant contact details, signed image URLs, provider credentials or raw error objects to logs. Durable authentication-denial records belong in `admin_security_audit`.
