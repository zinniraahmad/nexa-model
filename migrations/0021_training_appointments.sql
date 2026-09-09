CREATE TABLE IF NOT EXISTS training_appointments (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 15 AND 480),
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_appointments_scheduled_at
ON training_appointments(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_training_appointments_candidate
ON training_appointments(candidate_id, scheduled_at);

