# P6 — Forward book and external feeds

Prerequisite: P4 passing (P5 may run in parallel).

Build for the data that isn't here yet, so that when it arrives no UI work is
needed. **Zero synthetic rows** — an empty adapter is correct; a fake one is a
trap.

## Task

1. **Adapter interface** — a common shape with states `not_configured`,
   `configured`, `degraded`, `blocked`. Each adapter is keyed to a Veluma
   `feed_key` (VELUMA_FEED §4) and has a config screen, a health entry on the
   P3 data-health page, and an honest empty state.

   Five adapters:
   - **service & price master** (`b4t_service_price_master`) — blocks
     sufficiency gates G3, G4
   - **price change history** (`b4t_price_change_history`) — blocks G3
   - **hotel occupancy + group blocks** (`pms_hotel_occupancy`, Fairmont PMS)
     — blocks G6
   - **forward bookings / pace** (`b4t_future_revenues`, report 1656) —
     blocked upstream, blocks G7
   - **technician detail rows** (D8 currently totals-only)

1b. **Veluma transport goes live-capable.** The pull client and webhook
   receiver built dark in P2 get their operational surface:
   - config screen: base URL, API key, HMAC secret, poll interval — secrets
     stored server-side, write-only in the UI, never rendered back
   - a connection test button (auth + reachability + feed list)
   - transport health on the data-health page: last delivery per feed, cursor
     position, signature-verification failures, staleness
   - cutover file-drop → live API is **config only**; a test proves both modes
     against the same envelope produce identical results (reusing P2's shared
     transport suite)

2. **Forward-book surface, built in full.** Today it renders its blocked state:
   `NullReferenceException`, blocked since 2026-08-20, and the escalation owner.
   When Book4Time fixes 1656, ingest should light this page up with no new UI
   work. This is the highest-value report in the set and it is the broken one —
   build it as if it works.

3. **Hotel occupancy matters more than it looks.** Resort spa demand is largely
   a function of hotel occupancy and group blocks. Without it, any model will
   attribute hotel-driven swings to price and recommend the wrong thing. Build
   the adapter so the feed can land the day the organizational conversation
   concludes.

4. **Un-blocking is an admin action** — changing a source from `blocked` to
   `active` requires `admin`, a reason, and an audit record. It is never
   automatic on a successful parse.

## Acceptance criteria

- [ ] Five adapters exist with config screens and honest empty states
- [ ] A test asserts **zero** rows in `measure_fact` originate from any
      unconfigured adapter
- [ ] Veluma transport config screen works; connection test passes against the
      mock server; secrets never appear in any response or client bundle
- [ ] File-drop → live-API cutover is demonstrated by config change alone
- [ ] Forward-book page renders block reason and blocked-since date
- [ ] Un-blocking D7 requires admin and writes an audit record
- [ ] A `pms_hotel_occupancy` envelope dropped into the intake flows end-to-end
      with no code change
- [ ] `pnpm verify` green

## When done

`docs/phase-notes/P6.md`, then stop.
