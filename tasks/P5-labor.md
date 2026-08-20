# P5 — Labor and scheduling

Prerequisite: P4 passing.

Stripping technician names removed the entire staffing dimension. This phase
restores the dimension without restoring identity (I11).

## Task

1. **Pseudonym registry** — `technician_pseudonym` maps a hashed source
   identifier to a stable ID (`tech_017`). Stability across ingests is the whole
   point: a per-run hash is useless for trend analysis. The table is
   access-restricted, server-only, and **never joined into any analytics view**.

2. **Weekly schedule ingest** — technician-weekly-schedule for 2026-08-17→23.

3. **Hours view** — scheduled vs booked vs serviced, per technician pseudonym
   and in total. 8/19 totals: 52 clients, 56.50 service hours, 73.25 booked
   hours, 224.75 scheduled hours.

4. **Utilization** — report the three components separately. The source's
   reported 57% matches neither 56.50/224.75 (25.1%) nor 73.25/224.75 (32.6%),
   so a third denominator is in play (H6, unresolved). **Do not publish a
   computed utilization figure that competes with the source's.** Show the
   components, show the source's 57% with its "formula unknown" flag, and link
   to H6.

5. **Coverage view** — scheduled capacity by hour against the demand-by-hour
   curve from P4, highlighting divergence. This is descriptive only: it shows
   where staffing and demand disagree. It makes **no** staffing recommendation —
   that requires the pricing/demand model, which is gated (P7).

## Acceptance criteria

- [ ] Pseudonyms are stable across two separate ingests of overlapping periods
- [ ] A query-layer test asserts `technician_pseudonym` is unreachable from any
      analytics view or client-facing query
- [ ] Totals reconcile to D8 exactly: 52 / 5650 / 7325 / 22475 (hours ×100)
- [ ] The app shows the three hour components and the flagged 57%, and publishes
      no competing utilization number
- [ ] Coverage view renders and makes no recommendation
- [ ] `pnpm verify` green

## When done

`docs/phase-notes/P5.md`, then stop.
