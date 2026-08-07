CREATE TABLE IF NOT EXISTS applicant_details (
  application_id TEXT PRIMARY KEY,
  responses_json TEXT NOT NULL,
  application_status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_applicant_details_status
ON applicant_details(application_status);
