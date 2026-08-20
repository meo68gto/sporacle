# P3 — Reconciliation and data quality

Prerequisite: P2 passing.

**This is the phase that decides whether Sporacle is trustworthy.** Everything
after it is presentation. Do not compress it, and do not let it drift toward
"just show one number."

Read `docs/DATA_CONTRACT.md` §6 and CLAUDE.md §2 and §5 again before starting.

## Task

1. **Variance ledger** — for a chosen business date, show every measure that
   plausibly answers "how much money," side by side: value, measure key, grain,
   date basis, source report, pulled-at. Plus pairwise deltas. There is
   deliberately **no headline total**. For 2026-08-19 this shows five figures:
   $10,226 / $15,801.95 / $10,806 / $9,996 / $46,336, with D5 visually separated
   because it is on `booking_date`.

2. **Hypothesis board** — seed H1–H6 from DATA_CONTRACT §6 as `open`. Each
   displays its proposed explanation, the test that would settle it, and what
   data is missing. `analyst` can add and edit hypotheses. Only `admin` can
   promote, and promotion:
   - writes a `measure_definition` row with `signed_off_by` and `signed_off_at`
   - is a migration-backed change, not a runtime toggle
   - appears in the audit trail

   Note H4 (9,996 + 230 = 10,226, exactly D1) is arithmetically clean. It is
   still not auto-promoted. The source instruction is *do not force*.

3. **Provenance chip** — one shared component used by every rendered figure
   (I4). Shows report code, business date, pulled-at, ingest run on
   hover/focus. Accessible, not hover-only.

4. **Data health page** — per source: status, last successful pull, staleness in
   days, quarantine count, blocked reason and blocked-since. D7 shows its
   `NullReferenceException` prominently; this is the report worth chasing.

5. **Unvalidated treatments** — `facility_fill_pct` (3.73% vs 34.48% hottest,
   denominator unverified) and `labor_utilization_pct_reported` (57%, formula
   unknown) render with an explicit warning affordance wherever they appear.

## Acceptance criteria

- [ ] 8/19 variance ledger shows all five figures with correct labels and bases
- [ ] A Playwright test crawls every route and **fails** if any element is
      labelled "Revenue", "Total Revenue", or "Total Sales" without a measure key
- [ ] A DOM-crawl test asserts every numeric figure has a provenance chip
- [ ] `viewer` and `analyst` cannot promote a hypothesis; `admin` can, and it
      writes a signed `measure_definition` plus an audit row
- [ ] Promotion is reflected in a subsequent migration, not a config row
- [ ] Data health page shows D7 blocked with reason and date
- [ ] Fill% and reported-utilization carry visible unvalidated warnings
- [ ] `pnpm verify` green

## Do not

- Auto-promote H4 or any hypothesis, however clean the arithmetic.
- Add a "best guess revenue" setting, a default measure, or a preference that
  collapses the five figures into one.

## When done

`docs/phase-notes/P3.md`, then stop.
