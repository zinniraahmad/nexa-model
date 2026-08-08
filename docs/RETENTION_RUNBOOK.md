# Application retention review

Owner: Zinnira Ahmad
Operational mailbox: `hello@nexa-model.com`
Frequency: every Monday, and on the first working day after any missed review
Scope: submitted and incomplete Nexa Model applications in D1 and their private ImageKit files

## Required review

1. Sign in to `https://onlyadmin.nexa-model.com` using the named administrator account and MFA.
2. Review every amber retention warning. A submitted application starts warning 30 days before `submitted_at + 6 months`. Overdue records are marked in red.
3. Delete a record when it is no longer required. The admin delete action must remove ImageKit files first and only then remove the D1 rows. A storage failure intentionally keeps the D1 record so the deletion can be retried.
4. If a record must be retained, add an internal note containing `RETENTION`, the reason, decision date and next review date. Permitted examples are an active shortlist/assignment, an unresolved applicant request or dispute, or a documented legal requirement. Do not extend retention merely because review was missed.
5. Record the review in the log below, including a zero-record review. Never copy applicant names, email addresses, phone numbers or photographs into this repository.
6. Escalate an overdue record that cannot be deleted to the breach/privacy owner on the same working day.

## Review log

| Review date (MYT) | Reviewer | Due | Deleted | Retained | Next review / issue |
|---|---|---:|---:|---:|---|
| 2026-08-08 | Codex tabletop check for Zinnira Ahmad | 0 synthetic | 0 | 0 | Production review to begin before applicant collection |

The owner may later replace this formally assigned review with an automated scheduled Worker, but automated deletion must preserve the ImageKit-first failure rule and emit an auditable outcome without logging applicant data.
