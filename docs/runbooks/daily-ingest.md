# Daily ingest runbook

For spa operations. You do not need the codebase.

## Normal procedure (file-drop)

1. Book4Time reports are automated into Veluma. Until Veluma’s live API is switched on here, you receive **envelope JSON files** (one report run per file).
2. Sign in to Sporacle as **admin**.
3. Open **Ingest**.
4. Paste the envelope JSON and submit, or drop the file into the intake directory if your operator set `INTAKE_DIR`.
5. Open **Data health**. Each source should show a fresh successful run. Report 1656 (forward book) should show **blocked** with `NullReferenceException` until Book4Time fixes it — that is expected, not a failed ingest.
6. Open **Variance**. You should see five different money figures. The app will not pick one. That is correct.

## If a delivery quarantines

The health page shows a quarantine count. Typical causes:

- File is not JSON, or not an envelope (`envelope_version`, `feed_key`, `payload`, `payload_sha256`).
- Checksum mismatch — the file was edited after Veluma hashed it. Re-export from Veluma; do not hand-edit totals.
- Rows and totals disagree — the source report is internally inconsistent. Do not “fix” the numbers. Escalate the report.
- Unknown `feed_key` — we do not auto-create sources.

Re-drive the same file after the problem is fixed. Same `delivery_id` will not double-count.

## Live Veluma API (appendix)

When Veluma E13 exists, set server env only (never in the browser):

- `VELUMA_BASE_URL`
- `VELUMA_API_KEY`
- `VELUMA_WEBHOOK_SECRET`
- `VELUMA_POLL_INTERVAL`

Open **Veluma**. Confirm base URL is set and secrets show only as “yes (write-only)”. File-drop remains the recovery path.
