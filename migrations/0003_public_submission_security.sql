ALTER TABLE applicant_details ADD COLUMN upload_token_hash TEXT;
ALTER TABLE applicant_details ADD COLUMN upload_token_expires_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applicants_email_nocase
ON applicants(email COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_applicant_photos_slot
ON applicant_photos(application_id, photo_type);
