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
CREATE TABLE applicants (application_id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, current_location TEXT NOT NULL);
CREATE TABLE applicant_details (application_id TEXT PRIMARY KEY, responses_json TEXT NOT NULL, application_status TEXT NOT NULL, submitted_at TEXT NOT NULL, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE);
CREATE TABLE applicant_photos (file_id TEXT PRIMARY KEY, application_id TEXT NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL, photo_type TEXT NOT NULL, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE);
INSERT INTO applicants VALUES ('recovery-drill-001', 'Synthetic Recovery Applicant', 'recovery-drill@example.invalid', '+60000000000', 'Synthetic Location');
INSERT INTO applicant_details VALUES ('recovery-drill-001', '{"synthetic":true}', 'submitted', '2026-08-08 00:00:00');
INSERT INTO applicant_photos VALUES ('synthetic-imagekit-id', 'recovery-drill-001', 'synthetic.jpg', 'https://example.invalid/private/synthetic.jpg', 'front_facing_1');
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
row = connection.execute("SELECT (SELECT COUNT(*) FROM applicants), (SELECT COUNT(*) FROM applicant_details), (SELECT COUNT(*) FROM applicant_photos)").fetchone()
print(json.dumps({"applicants": row[0], "details": row[1], "photos": row[2]}))
'@
  Set-Content -LiteralPath $verifyPath -Value $python -Encoding utf8
  $row = (python $verifyPath $restoredDbPath) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'The restored SQLite backup could not be opened.' }
  if ($row.applicants -ne 1 -or $row.details -ne 1 -or $row.photos -ne 1) { throw "Restoration verification failed: $result" }

  $checksum = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  Write-Output "D1_RECOVERY_DRILL_PASS applicants=1 details=1 photos=1 sha256=$checksum"
}
finally {
  if (Test-Path -LiteralPath $resolvedDrillRoot) {
    Remove-Item -LiteralPath $resolvedDrillRoot -Recurse -Force
  }
}
