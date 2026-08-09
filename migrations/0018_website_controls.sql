CREATE TABLE IF NOT EXISTS website_controls (
  control_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

INSERT OR IGNORE INTO website_controls (control_key, enabled)
VALUES ('applications_closed', 0);
