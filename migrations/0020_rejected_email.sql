ALTER TABLE applicant_details ADD COLUMN rejected_email_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_applicant_details_rejected_email
ON applicant_details(rejected_email_sent_at)
WHERE rejected_email_sent_at IS NOT NULL;

CREATE TABLE email_messages_with_rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resend_email_id TEXT UNIQUE,
  application_id TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'candidate_receipt', 'admin_notification', 'pending_recovery',
    'candidate_shortlisted', 'candidate_rejected'
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

INSERT INTO email_messages_with_rejections (
  id, resend_email_id, application_id, message_type, recipient_type, status,
  provider_http_status, failure_code, daily_quota_used, monthly_quota_used,
  rate_limit_remaining, rate_limit_reset_seconds, attempted_at, accepted_at
)
SELECT
  id, resend_email_id, application_id, message_type, recipient_type, status,
  provider_http_status, failure_code, daily_quota_used, monthly_quota_used,
  rate_limit_remaining, rate_limit_reset_seconds, attempted_at, accepted_at
FROM email_messages;

DROP TABLE email_messages;
ALTER TABLE email_messages_with_rejections RENAME TO email_messages;

CREATE INDEX idx_email_messages_attempted
ON email_messages(attempted_at DESC);

CREATE INDEX idx_email_messages_type_status
ON email_messages(message_type, status, attempted_at DESC);
