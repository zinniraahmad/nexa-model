# Applicant privacy-rights workflow

Owner: Zinnira Ahmad  
Intake mailbox: `itszinniraahmad@gmail.com`  
Backup contact: `mynexamodel@gmail.com`

This workflow covers access, correction, consent withdrawal and deletion requests. Do not ask an applicant to send identity documents unless the request cannot reasonably be verified using less intrusive information.

## Intake and identity verification

1. Record an internal request ID, received date, request type, application reference (if supplied), owner and status. Do not put applicant data in this repository.
2. Acknowledge receipt without confirming that a particular email is in the database.
3. Verify control of the application email by replying only to that address. Ask for the application reference plus one non-sensitive matching field if necessary. For a request from a different address, pause and perform proportionate additional verification.
4. Search through the Access-protected admin application using the verified email/reference. Do not disclose a match until verification is complete.
5. Record the decision and response date. Escalate uncertainty or a refusal to qualified Malaysian counsel before responding.

## Access

Export only the verified applicant's answers, submission/review dates, status, photo filenames/categories and relevant processing/provider information. Share the export through an agreed secure method; do not email signed ImageKit URLs because they are temporary bearer links. Redact internal material that should lawfully remain confidential and document the basis.

## Correction

Confirm the exact field and replacement value in writing. Validate it against the form schema, update only that applicant's D1 record, retrieve the record again and ask the applicant to confirm the correction. Photo replacement must use a controlled support process that deletes the old ImageKit object only after the new private object is verified.

## Consent withdrawal

Clarify the affected consent (application processing, WhatsApp contact, profile sharing or overseas-provider processing). Explain any consequence before acting. Stop the affected future processing promptly. If the application cannot continue without that processing, move directly to the deletion workflow unless another documented legal reason requires limited retention. Withdrawal does not undo processing already completed lawfully.

## Deletion

1. Reconfirm the application reference and scope with the verified applicant.
2. Use the admin delete control. It deletes every ImageKit file before deleting `applicant_photos`, `applicant_details` and `applicants` from D1.
3. If ImageKit returns an error, do not manually delete the D1 rows. Retry/escalate so no orphaned private photos remain.
4. Search the admin list for the reference/email and confirm no result. Confirm the ImageKit file IDs return not found. Record completion without retaining a copy of the deleted application.
5. Tell the applicant deletion is complete, or explain the limited lawful exception and next review date.

## Pre-production tabletop test — 8 August 2026

| Scenario | Expected control | Result |
|---|---|---|
| Unknown requester asks whether an email applied | Uniform acknowledgement; no existence disclosure | Pass — public access endpoint regression test covers all three states |
| Verified applicant requests access | Admin search only after mailbox/reference verification; secure export | Pass — procedure reviewed; live synthetic exercise remains part of production E2E |
| Correction requested | Exact field confirmed, schema-validated, read back | Pass — procedure reviewed; no real record altered |
| Consent withdrawn | Scope/consequence recorded; stop processing or delete | Pass — procedure reviewed |
| Deletion where ImageKit fails | D1 rows remain for safe retry | Pass — enforced by admin Worker control flow |
| Successful deletion | ImageKit first, then all three D1 tables | Pass — authorized synthetic application `5b6ef911-0387-41b8-b808-397fbfc86ee7` was deleted through the MFA-protected admin; all three D1 counts were zero and a previously signed ImageKit URL returned `404` |

The production exercise used no real applicant data. It created and finalized all 19 required private photo slots, verified signed admin access, then removed the application and every stored image.
