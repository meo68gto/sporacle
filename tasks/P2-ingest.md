# P2 — Ingest pipeline

Prerequisite: P1 passing.

Read `docs/VELUMA_FEED.md` in full — the envelope is the input format for this
entire phase. Then `docs/DATA_CONTRACT.md` §5 — the golden fixtures. Your
parsers are correct when they reproduce those numbers to the cent, and not
before.

## Task

Pipeline: **envelope arrives (any transport) → envelope validation →
per-source payload parser → Zod validate → staging → promote to
`measure_fact`**, with quarantine on any failure.

1. **Intake — three transports, one envelope, one downstream code path**:
   - **File-drop** (day-one mode): watched local directory plus an admin upload
     screen, accepting envelope `.json` files.
   - **Veluma pull client**: cursor-based polling of the deliveries endpoint.
     Veluma's API doesn't exist yet (its Phase 4/E13) — build the client
     against the contract in VELUMA_FEED §1–§3, tested against a local mock,
     shipped dark behind config.
   - **Webhook receiver**: `POST /api/ingest/veluma`, HMAC-SHA256 verification
     per VELUMA_FEED §3, also dark.

   Record `transport`, `delivery_id`, `feed_key`, `payload_sha256`,
   `origin_pulled_at`, `delivered_at`, and business-date range on every
   `ingest_run`.

1b. **Envelope validation (I12/I13/I1)**, before any parser runs:
   - `payload_sha256` recomputed and matched; mismatch → quarantine
   - **Tamper test**: recompute totals from `payload.rows` and compare to
     `payload.totals`. Disagreement → quarantine *with both values recorded* —
     a source whose own rows and totals disagree is information, not noise
   - Unknown `feed_key` → quarantine; never auto-create a source
   - PII field scan (I1) → quarantine on hit
   - Pull client sends no tenant header of any kind (I13)

2. **One parser module per source** — D1/1421, D2/1412, D3/1253, D4/1524,
   D5/1343, D6 turnaway, D7/1656, D8/1243, plus the two ranged exports
   D9 service-analysis-by-day and D10 technician-weekly-schedule (report codes
   not yet confirmed — key on the source key, not a guessed code). Each with its
   own fixture file and test. Parsers:
   - preserve the footer/dimension distinction via `is_total_row`
   - emit only measure keys declared for that source in DATA_CONTRACT §3
   - **never synthesize rows** (I3). D8 arrives totals-only with 34 technician
     rows withheld at source — ingest the totals, invent nothing.

3. **Idempotency and corrections**: same `delivery_id` re-delivered is a no-op
   on `measure_fact` (a new `ingest_run` is still recorded). Same `feed_key` +
   `origin` with a **different** `payload_sha256` is a correction: ingest it,
   set `supersedes_run_id` on the new run, and retire the superseded rows.
   Dedupe on `(source_id, measure_key, business_date, dimension_type,
   dimension_value)` keeping the most recent `origin_pulled_at`, and log every
   collision — ranged runs (8/07→8/20, 8/17→8/23) overlap single-day runs and
   must not double-count.

4. **Quarantine**: any validation failure quarantines the whole delivery with
   the raw envelope. Never partially promote. A quarantined delivery is visible
   and re-drivable after the problem is fixed.

5. **Blocked sources**: D7/1656 arrives as a `status: "blocked"` envelope and
   produces `ingest_run.status = 'blocked'` with the upstream error, distinct
   from both `failed` and an empty `success`. A feed with **no delivery at
   all** is transport trouble, tracked separately (staleness on the health
   page) — do not conflate the two.

## Acceptance criteria

- [ ] Ingesting the 2026-08-19 envelope fixture set reproduces **every** value
      in DATA_CONTRACT §5 exactly — including D1 peak hour `14` = 11 / $2,302
      and D2 peak hour `15` = $4,059.06
- [ ] D5 lands on `booking_date` basis: ONLINE 18/$4,978, SPA 185/$41,358,
      MOBILE 0, TOTAL 203/$46,336
- [ ] Redelivering the same `delivery_id` adds zero `measure_fact` rows; a
      changed-payload correction supersedes and records `supersedes_run_id`
- [ ] Checksum mismatch, rows-vs-totals tamper, unknown `feed_key`, and PII
      scan hit each quarantine with zero rows promoted
- [ ] The same envelope delivered via file-drop, mock pull, and mock webhook
      produces byte-identical `measure_fact` rows — one shared test suite runs
      against all three transports
- [ ] The pull client sends no tenant-identifying header — asserted by test
- [ ] D7 yields `blocked`, not `failed`, not empty-success; a missing delivery
      shows as staleness, not as blocked
- [ ] D8 yields totals only; a test asserts zero per-technician rows were created
- [ ] Loading the 14-day and weekly ranged envelopes after the single-day ones
      produces no double-counting, and logs the collisions
- [ ] `pnpm verify` green

## When done

`docs/phase-notes/P2.md` including a table of every fixture value you
reproduced. Then stop.
