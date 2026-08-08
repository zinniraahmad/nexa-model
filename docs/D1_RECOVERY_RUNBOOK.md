# D1 backup and recovery

Owner: Zinnira Ahmad  
Database: `nexa-production`  
Rule: never restore directly over production as the first recovery attempt.

## Production backup procedure

1. Pause application writes or record an exact recovery cutoff.
2. Export D1 through authenticated Wrangler to an encrypted, access-restricted location. Do not place the export in Git, email or a shared drive.
3. Record the database ID, export time, Worker version and SHA-256 checksum separately.
4. Restore first into a newly created recovery database, apply any missing migrations, and validate row counts, foreign-key relationships and representative records.
5. Point a non-public recovery Worker at the restored database and test reads before approving any production binding change.
6. Record the decision and delete temporary recovery resources only after approval.

Example commands (replace paths and recovery database name deliberately):

```powershell
npx wrangler d1 export nexa-production --remote --output <encrypted-restricted-path>\nexa-production.sql
npx wrangler d1 create nexa-recovery-YYYYMMDD
npx wrangler d1 execute nexa-recovery-YYYYMMDD --remote --file <encrypted-restricted-path>\nexa-production.sql
```

## Synthetic restoration drill

The repository script `scripts/d1-recovery-drill.ps1` builds an isolated local D1 store, inserts only synthetic data, exports its SQLite database, restores it to a second isolated store and verifies the applicant, details and photo rows. It never uses `--remote` and refuses paths outside the system temporary directory.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/d1-recovery-drill.ps1
```

Record the run date, Wrangler version, row-count result and backup checksum below.

| Date | Scope | Result | Evidence |
|---|---|---|---|
| 2026-08-08 | Local isolated D1, synthetic applicant only | Pass: applicants=1, details=1, photos=1 | SHA-256 `32CC1FA2B318B569B176F73FBD2063B615553A6F2CE3A96A38DDB4A968690941`; temporary backup securely removed after verification |
