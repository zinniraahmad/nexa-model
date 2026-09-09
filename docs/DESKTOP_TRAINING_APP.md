# Nexa Training Evaluation desktop app

The desktop app is separate from the Nexa Admin website. It performs local training evaluation and stores candidate data only on the BitLocker-protected `PRIVATE_SSD (X:)`.

## Storage requirement

Before opening the app:

1. Connect `PRIVATE_SSD` and unlock it with BitLocker.
2. Confirm that Windows mounts it as `X:`.
3. Start Nexa Training Evaluation.

The app blocks access when `X:` is missing, locked or read-only. It never falls back to `C:` or another disk.

The managed data root is:

```text
X:\NexaTraining\
  database\
  candidates\
  imports\
  recovery\
  reports\
  thumbnails\
```

Candidate originals are never modified or automatically deleted. Google Drive and WhatsApp locations are treated as import sources, not durable storage.

## Evaluation workflow

1. Select an existing local candidate or create a candidate workspace.
   Use **Sync Contacted** to sign in through Nexa Admin and securely copy the current Contacted candidate list into the local X: database.
2. Add Training 1–4.
3. Select the relevant pose.
4. Drag images or videos from Windows Explorer into the drop zone.
5. Compare candidate media with the pose reference.
6. Enter scores and report comments, then save the evaluation.
7. Export the candidate PDF report.

Imports are copied to `X:` and deduplicated with SHA-256 checksums. Supported image and video files are checked by content signature rather than filename alone.

## Watermark and reports

The app displays and exports candidate images with:

```text
PROPERTY OF NEXA MODEL — PRIVATE & CONFIDENTIAL
```

The local protected original remains unchanged. PDF reports place the reference and candidate images side by side and exclude internal notes.

## Development commands

```powershell
npm run desktop:start
npm run desktop:demo
npm run build:desktop
npm run desktop:package
```

Use `npm run desktop:demo` for routine development. It seeds dummy Contacted candidates under `X:\NexaTraining-Development` and disables live Admin synchronization. It never reads or writes the production `X:\NexaTraining` database.

The Windows installer is generated under `release-desktop\`.

## Current scope

- Single Windows PC and single evaluator.
- Contacted-only candidate synchronization through the authenticated Nexa Admin endpoint, plus optional local candidate creation.
- Offline image and video review.
- No automated deletion.
- No automatic Google Drive synchronization.
- Email, private-link and Nexa website report delivery are intentionally deferred.
