-- Permit a new application without replacing an older application that uses
-- the same email address. Staff can review duplicates; prior records remain
-- immutable unless their exact upload token is presented.
DROP INDEX IF EXISTS idx_applicants_email_nocase;

CREATE TABLE IF NOT EXISTS application_intake_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_intake_email
ON application_intake_tokens(email COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_application_intake_expiry
ON application_intake_tokens(expires_at);

ALTER TABLE applicant_details ADD COLUMN confirmation_token_hash TEXT;
ALTER TABLE applicant_details ADD COLUMN confirmation_token_expires_at TEXT;
ALTER TABLE applicant_details ADD COLUMN email_verified_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applicant_confirmation_token
ON applicant_details(confirmation_token_hash)
WHERE confirmation_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applicant_confirmation_expiry
ON applicant_details(confirmation_token_expires_at)
WHERE confirmation_token_expires_at IS NOT NULL;
