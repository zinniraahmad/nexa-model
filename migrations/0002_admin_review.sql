ALTER TABLE applicant_details ADD COLUMN admin_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE applicant_details ADD COLUMN reviewed_at TEXT;
ALTER TABLE applicant_details ADD COLUMN reviewed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_applicant_details_submitted_at
ON applicant_details(submitted_at DESC);
