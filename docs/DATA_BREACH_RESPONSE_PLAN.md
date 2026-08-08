# Personal-data breach response plan

Incident owner and decision maker: Zinnira Ahmad
Public incident contact: `hello@nexa-model.com`
Direct owner fallback: `itszinniraahmad@gmail.com`
Provider escalation channels: Cloudflare support/security, ImageKit support/security and Resend support/security through their authenticated consoles

This plan applies to loss, unauthorized access, disclosure, alteration or destruction involving application answers, photos, email-delivery data, access tokens, logs or administrator credentials.

## First response

1. Write down when and how the incident was discovered and when Nexa Model first became aware. Start an incident timeline in a restricted location.
2. Contain the incident without destroying evidence: revoke exposed credentials/tokens, disable a compromised admin account or route, preserve affected Worker versions and stop further collection if needed.
3. Preserve evidence read-only where possible: Cloudflare request/security/audit logs, Worker logs and version IDs, D1 query/export metadata, ImageKit file/audit identifiers, Resend delivery IDs, relevant headers and screenshots. Record collector, timestamp, source and SHA-256 hash for exported files. Do not commit evidence or personal data to Git.
4. Identify affected systems, time window, data categories, approximate people/records, likely cause, recipients and containment status. Engage qualified incident-response or legal help when impact is uncertain.

## Malaysia PDPA notification assessment

The owner must make and document the assessment immediately. Under the current official DBN process, notify the Commissioner when the breach causes or is likely to cause significant harm, including relevant risks such as physical injury, financial/credit/property harm, unlawful misuse, sensitive-data exposure, identity fraud or significant scale. The official form asks whether the initial notification is submitted within 72 hours after awareness; if late, it requires reasons and supporting evidence. Do not wait for a perfect investigation—submit available facts and supplement them.

When significant harm to affected people is likely, prepare clear individual notices without unnecessary delay describing what happened, affected data, likely consequences, mitigation already taken, steps they should take and a monitored contact. Never speculate or include another person's data.

Submit a Commissioner notification through the official SPDP DBN service and save its reference in the restricted incident record. Additional information requested by the official service must be supplied progressively within its stated timeframe.

Official references:

- https://www.pdp.gov.my/ppdpv1/en/guidelines-and-circulars-on-data-breach-notification-dbn/
- https://daftar.pdp.gov.my/v1/dbn

## Recovery and closure

1. Eradicate the cause, rotate affected secrets, patch and deploy through the normal reviewed process.
2. Validate Cloudflare Access membership/MFA, Worker allowlist, D1 integrity, private ImageKit delivery and email configuration before reopening collection.
3. Monitor for recurrence and unusual admin/application traffic.
4. Document notification decisions, communications, recovery checks, retained evidence and lessons learned. Set corrective actions, owners and dates.
5. Do not delete incident evidence until the owner has confirmed that legal, regulator, provider and dispute needs have ended.

## Tabletop exercise — 8 August 2026

Scenario: an administrator session is suspected to have exposed applicant answers and signed image links. Outcome: collection/admin access is contained; session and secrets are revoked; Cloudflare/Worker/ImageKit evidence is preserved; affected population and significant-harm factors are assessed; the 72-hour DBN clock is tracked; notification and recovery owners are Zinnira Ahmad. Open dependency: live Cloudflare Access MFA verification must be completed before production collection.
