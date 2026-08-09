$ErrorActionPreference = 'Stop'

$drillRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nexa-d1-recovery-drill-" + [guid]::NewGuid().ToString('N'))
$sourceState = Join-Path $drillRoot 'source'
$restoredState = Join-Path $drillRoot 'restored'
$fixturePath = Join-Path $drillRoot 'fixture.sql'
$verifyPath = Join-Path $drillRoot 'verify.py'
$findDbPath = Join-Path $drillRoot 'find-d1.py'
$backupToolPath = Join-Path $drillRoot 'backup-d1.py'
$backupPath = Join-Path $drillRoot 'backup.sqlite'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$resolvedDrillRoot = [System.IO.Path]::GetFullPath($drillRoot)
if (-not $resolvedDrillRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Recovery drill path must remain inside the system temporary directory.'
}

New-Item -ItemType Directory -Path $sourceState, $restoredState -Force | Out-Null

try {
  $fixture = @'
PRAGMA foreign_keys = ON;
CREATE TABLE applicants (
  application_id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT NOT NULL, current_location TEXT NOT NULL, deleted_at TEXT,
  delete_after TEXT, deleted_by TEXT, deletion_type TEXT
);
CREATE TABLE applicant_details (
  application_id TEXT PRIMARY KEY, responses_json TEXT NOT NULL,
  application_status TEXT NOT NULL, submitted_at TEXT NOT NULL,
  admin_notes TEXT NOT NULL DEFAULT '', reviewed_at TEXT, reviewed_by TEXT,
  upload_token_hash TEXT, upload_token_expires_at TEXT, confirmation_sent_at TEXT,
  recovery_token_hash TEXT, recovery_token_expires_at TEXT, confirmation_token_hash TEXT,
  confirmation_token_expires_at TEXT, email_verified_at TEXT,
  admin_notification_sent_at TEXT, tags_json TEXT NOT NULL DEFAULT '[]',
  shortlisted_email_sent_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);
CREATE TABLE applicant_photos (file_id TEXT PRIMARY KEY, application_id TEXT NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL, photo_type TEXT NOT NULL, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE);
CREATE TABLE application_review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL,
  previous_status TEXT, new_status TEXT NOT NULL, previous_notes TEXT NOT NULL DEFAULT '',
  new_notes TEXT NOT NULL DEFAULT '', previous_tags_json TEXT NOT NULL DEFAULT '[]',
  new_tags_json TEXT NOT NULL DEFAULT '[]', changed_at TEXT NOT NULL,
  changed_by TEXT, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);
CREATE TABLE application_deletion_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL,
  applicant_name TEXT NOT NULL, event_type TEXT NOT NULL, deletion_type TEXT,
  occurred_at TEXT NOT NULL, performed_by TEXT NOT NULL
);
CREATE TABLE admin_security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL,
  reason_code TEXT NOT NULL, actor_email TEXT, request_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_operational_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL,
  event_name TEXT NOT NULL, http_status INTEGER,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_operational_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL,
  event_count INTEGER NOT NULL, window_started_at TEXT NOT NULL,
  alerted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, delivery_status TEXT NOT NULL
);
CREATE TABLE application_access_tokens (email TEXT NOT NULL, purpose TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY (email, purpose));
CREATE TABLE application_intake_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
INSERT INTO applicants (application_id, full_name, email, phone, current_location) VALUES ('recovery-drill-001', 'Synthetic Recovery Applicant', 'recovery-drill@example.invalid', '+60000000000', 'Synthetic Location');
INSERT INTO applicant_details (application_id, responses_json, application_status, submitted_at, admin_notes, tags_json) VALUES ('recovery-drill-001', '{"synthetic":true,"marital_status":"single"}', 'submitted', '2026-08-08 00:00:00', 'Synthetic note', '["recovery-test"]');
INSERT INTO applicant_photos VALUES ('synthetic-imagekit-id', 'recovery-drill-001', 'synthetic.jpg', 'https://example.invalid/private/synthetic.jpg', 'front_facing_1');
INSERT INTO application_review_history (application_id, previous_status, new_status, changed_at, changed_by) VALUES ('recovery-drill-001', 'submitted', 'reviewing', '2026-08-08 00:01:00', 'recovery-admin@example.invalid');
INSERT INTO application_deletion_audit (application_id, applicant_name, event_type, deletion_type, occurred_at, performed_by) VALUES ('purged-synthetic-reference', 'Purged Synthetic Applicant', 'permanently_deleted', 'manual', '2026-08-08 00:02:00', 'recovery-admin@example.invalid');
INSERT INTO admin_security_audit (event_type, reason_code, request_id) VALUES ('authentication_denied', 'synthetic_test', 'synthetic-ray');
INSERT INTO admin_operational_failures (service, event_name, http_status) VALUES ('imagekit', 'synthetic.failure', 502);
INSERT INTO admin_operational_alerts (service, event_count, window_started_at, delivery_status) VALUES ('imagekit', 3, '2026-08-08 00:00:00', 'sent');
'@
  Set-Content -LiteralPath $fixturePath -Value $fixture -Encoding utf8
  npx wrangler d1 execute nexa-production --local --persist-to $sourceState --file $fixturePath -y | Out-Host

  $finder = @'
import sqlite3, sys
for path in sys.argv[1:]:
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='applicants'").fetchone():
            print(path)
            raise SystemExit(0)
    except sqlite3.Error:
        pass
raise SystemExit(1)
'@
  Set-Content -LiteralPath $findDbPath -Value $finder -Encoding utf8
  $sourceDbCandidates = @(Get-ChildItem -LiteralPath $sourceState -Recurse -Filter '*.sqlite' | ForEach-Object FullName)
  $sourceDbPath = python $findDbPath @sourceDbCandidates
  if ($LASTEXITCODE -ne 0 -or -not $sourceDbPath) { throw 'Wrangler local D1 database was not created.' }
  $sourceDb = Get-Item -LiteralPath $sourceDbPath
  $backupTool = @'
import sqlite3, sys
source = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
destination = sqlite3.connect(sys.argv[2])
source.backup(destination)
destination.close()
source.close()
'@
  Set-Content -LiteralPath $backupToolPath -Value $backupTool -Encoding utf8
  python $backupToolPath $sourceDb.FullName $backupPath
  if ($LASTEXITCODE -ne 0) { throw 'The synthetic D1 backup could not be created.' }

  $sourcePrefix = [System.IO.Path]::GetFullPath($sourceState).TrimEnd('\\') + '\\'
  $relativeDbPath = $sourceDb.FullName.Substring($sourcePrefix.Length)
  $restoredDbPath = Join-Path $restoredState $relativeDbPath
  $restoredDbDirectory = Split-Path -Parent $restoredDbPath
  New-Item -ItemType Directory -Path $restoredDbDirectory -Force | Out-Null
  Copy-Item -LiteralPath $backupPath -Destination $restoredDbPath

  $python = @'
import json, sqlite3, sys
connection = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
tables = ["applicants", "applicant_details", "applicant_photos", "application_review_history", "application_deletion_audit", "admin_security_audit", "admin_operational_failures", "admin_operational_alerts", "application_access_tokens", "application_intake_tokens"]
counts = {table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}
marital_status = connection.execute("SELECT json_extract(responses_json, '$.marital_status') FROM applicant_details WHERE application_id = 'recovery-drill-001'").fetchone()[0]
print(json.dumps({"counts": counts, "marital_status": marital_status}))
'@
  Set-Content -LiteralPath $verifyPath -Value $python -Encoding utf8
  $row = (python $verifyPath $restoredDbPath) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'The restored SQLite backup could not be opened.' }
  $requiredRows = @('applicants', 'applicant_details', 'applicant_photos', 'application_review_history', 'application_deletion_audit', 'admin_security_audit', 'admin_operational_failures', 'admin_operational_alerts')
  foreach ($table in $requiredRows) {
    if ($row.counts.$table -ne 1) { throw "Restoration verification failed for $table." }
  }
  if ($row.marital_status -ne 'single') { throw 'Restoration verification failed for marital status.' }

  $checksum = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  Write-Output "D1_RECOVERY_DRILL_PASS core=3 review_audit=1 deletion_audit=1 security_audit=1 operational_failure=1 operational_alert=1 marital_status=single sha256=$checksum"
}
finally {
  if (Test-Path -LiteralPath $resolvedDrillRoot) {
    Remove-Item -LiteralPath $resolvedDrillRoot -Recurse -Force
  }
}
