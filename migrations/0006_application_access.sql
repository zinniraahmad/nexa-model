CREATE TABLE IF NOT EXISTS application_access_tokens (
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK (purpose IN ('new_application', 'submitted_notice')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (email, purpose)
);

CREATE INDEX IF NOT EXISTS idx_application_access_expiry
ON application_access_tokens(expires_at);
