# Backup and restore

Data lives in `SPORACLE_DATA_DIR` (default `.data`), a PGlite directory.

## Backup

```bash
tar -czf sporacle-data-$(date +%Y%m%d).tgz .data
```

## Restore drill

1. Stop `pnpm dev`.
2. Copy `.data` aside: `mv .data .data.bak`.
3. Restore: `tar -xzf sporacle-data-YYYYMMDD.tgz`.
4. Start `pnpm dev`, sign in, open Variance — 8/19 figures must match.

Run this once against a scratch copy before first production use. Production Postgres/Supabase restore uses that platform’s PITR instead.
