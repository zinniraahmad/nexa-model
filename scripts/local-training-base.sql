PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS applicants (
  application_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  current_location TEXT NOT NULL,
  deleted_at TEXT,
  delete_after TEXT,
  deleted_by TEXT,
  deletion_type TEXT
);

CREATE TABLE IF NOT EXISTS applicant_details (
  application_id TEXT PRIMARY KEY,
  responses_json TEXT NOT NULL DEFAULT '{}',
  application_status TEXT NOT NULL DEFAULT 'shortlisted',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  admin_notes TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  reviewed_by TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  shortlisted_email_sent_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO applicants (
  application_id, full_name, email, phone, current_location
) VALUES (
  'local-demo-trainee', 'Demo Trainee', 'demo.trainee@example.test', '+60123456789', 'Kuala Lumpur'
);

INSERT OR IGNORE INTO applicant_details (
  application_id, responses_json, application_status
) VALUES (
  'local-demo-trainee', '{"age":24}', 'contacted'
);

UPDATE applicant_details
SET application_status = 'contacted'
WHERE application_id = 'local-demo-trainee';
