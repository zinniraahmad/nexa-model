ALTER TABLE applicant_details ADD COLUMN shortlisted_email_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_applicant_details_shortlisted_email
ON applicant_details(shortlisted_email_sent_at)
WHERE shortlisted_email_sent_at IS NOT NULL;
