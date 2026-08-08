-- Restore one application record per email address. Migration 0007 removed
-- this index while the final email-confirmation experiment was evaluated.
-- Promote any records that already completed their uploads under that flow;
-- they no longer require a confirmation-link click.
UPDATE applicant_details
SET application_status = 'submitted',
    submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
    confirmation_token_hash = NULL,
    confirmation_token_expires_at = NULL
WHERE application_status = 'pending_email';

CREATE UNIQUE INDEX IF NOT EXISTS idx_applicants_email_nocase
ON applicants(email COLLATE NOCASE);
