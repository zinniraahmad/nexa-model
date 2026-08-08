CREATE TABLE IF NOT EXISTS application_review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_notes TEXT NOT NULL DEFAULT '',
  new_notes TEXT NOT NULL DEFAULT '',
  previous_tags_json TEXT NOT NULL DEFAULT '[]',
  new_tags_json TEXT NOT NULL DEFAULT '[]',
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by TEXT,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_application_review_history_application
ON application_review_history(application_id, changed_at DESC);
