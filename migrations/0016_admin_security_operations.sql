-- Durable admin authentication audit and operational failure alert state.
-- These tables intentionally avoid applicant data, request bodies, tokens and IP addresses.
CREATE TABLE IF NOT EXISTS admin_security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('authentication_denied', 'rate_limited')),
  reason_code TEXT NOT NULL,
  actor_email TEXT,
  request_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_security_audit_occurred
ON admin_security_audit(occurred_at DESC);

CREATE TABLE IF NOT EXISTS admin_operational_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL CHECK (service IN ('admin_api', 'imagekit')),
  event_name TEXT NOT NULL,
  http_status INTEGER,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_operational_failures_window
ON admin_operational_failures(service, occurred_at DESC);

CREATE TABLE IF NOT EXISTS admin_operational_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL CHECK (service IN ('admin_api', 'imagekit')),
  event_count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  alerted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_configured'))
);

CREATE INDEX IF NOT EXISTS idx_admin_operational_alerts_service
ON admin_operational_alerts(service, alerted_at DESC);
