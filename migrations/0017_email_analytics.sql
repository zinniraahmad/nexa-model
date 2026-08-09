-- Minimal Resend operational analytics. Email bodies, addresses, tokens and API keys are never stored.
CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resend_email_id TEXT UNIQUE,
  application_id TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'candidate_receipt', 'admin_notification', 'pending_recovery', 'candidate_shortlisted'
  )),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('candidate', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'failed')),
  provider_http_status INTEGER,
  failure_code TEXT,
  daily_quota_used INTEGER,
  monthly_quota_used INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_reset_seconds INTEGER,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_messages_attempted
ON email_messages(attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_messages_type_status
ON email_messages(message_type, status, attempted_at DESC);
