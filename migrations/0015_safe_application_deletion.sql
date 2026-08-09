-- Keep deleted applications recoverable for 30 days and retain an audit trail
-- independently from the applicant records that may later be purged.
ALTER TABLE applicants ADD COLUMN deleted_at TEXT;
ALTER TABLE applicants ADD COLUMN delete_after TEXT;
ALTER TABLE applicants ADD COLUMN deleted_by TEXT;
ALTER TABLE applicants ADD COLUMN deletion_type TEXT CHECK (deletion_type IN ('manual', 'retention_cleanup'));

CREATE INDEX IF NOT EXISTS idx_applicants_delete_after
ON applicants(delete_after)
WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_deletion_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('soft_deleted', 'restored', 'permanently_deleted')),
  deletion_type TEXT CHECK (deletion_type IN ('manual', 'retention_cleanup')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  performed_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_deletion_audit_application
ON application_deletion_audit(application_id, occurred_at DESC);
