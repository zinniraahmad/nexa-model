ALTER TABLE applicant_details ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_applicant_details_reviewed_at
ON applicant_details(reviewed_at DESC);
