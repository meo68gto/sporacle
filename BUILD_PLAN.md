# BUILD_PLAN.md — Sporacle

Nine phases. Strictly sequential unless noted. Each ends with `pnpm verify`
green and its acceptance criteria demonstrably met.

Per-phase paste-ready prompts live in `tasks/`.

---

## Dependency graph

```
P0 Scaffold
 └─ P1 Schema + measure registry
     └─ P2 Ingest pipeline
         └─ P3 Reconciliation & data quality
             └─ P4 Operational dashboards
                 ├─ P5 Labor & scheduling          ┐ may run
                 └─ P6 Forward book + ext. feeds   ┘ in parallel
                     └─ P7 Pricing workbench (gated)
                         └─ P8 Hardening & handover
```

P5 and P6 are the only pair that may overlap; both depend on P4 and neither
depends on the other. Everything else is strictly sequential.

---

## P0 — Scaffold and guardrails
**Goal:** an empty app that already enforces the rules.

Build: Next.js App Router + TS strict; Supabase local via CLI; Drizzle wired;
Vitest + Playwright; Supabase Auth with email allowlist and roles
`viewer|analyst|admin`; `pnpm verify` script; CI running verify on push.

Also build the invariant checks themselves, before there is anything to check:
- forbidden-column grep test (I1)
- a lint rule or test banning the identifiers `revenue`, `totalSales`,
  `amount` as bare schema/column names (I2, I3)
- `Money` branded type in `lib/money.ts`; ESLint rule banning arithmetic on
  bare numbers in `lib/measures/**`

**Acceptance**
- `pnpm verify` green on a clean checkout
- A deliberately-added `guest_email` column fails CI
- `/` requires auth; an off-allowlist email is rejected
- No `tenant_id` anywhere

---

## P1 — Schema and measure registry
**Goal:** the vocabulary exists and is type-enforced.

Build every table in `DATA_CONTRACT.md` §4. Seed `source` with the ten
reports including D7 as `blocked`. Implement the `Measure<K>` branded type,
`MeasureKey` union, `GrainOf<K>` / `DateBasisOf<K>` mapped types, and
homogeneous `sum` / `avg` / `ratio` helpers.

**Acceptance**
- Migrations apply clean to an empty DB and roll back
- `sum([apptValueByHour, posGrossSales])` is a **compile error** — proven by a
  `expect-type` / `tsd` negative test in CI
- Seeding produces 8 sources; D7 reads `blocked` with its reason
- No measure named `revenue` exists; a test asserts the registry excludes it

---

## P2 — Ingest pipeline
**Goal:** the ten report shapes land correctly and unmergeably, delivered from
Veluma.

Build: envelope intake → envelope validation → per-source payload parser → Zod
validation → staging → promote to `measure_fact`. The envelope and transports
are specified in `docs/VELUMA_FEED.md`; all three transports feed one code path:

- **Veluma pull client** — polls the deliveries endpoint with cursor; behind
  the adapter interface so it ships dark until Veluma E13 exists
- **Webhook receiver** — `POST /api/ingest/veluma`, HMAC-verified, also dark
- **File-drop fallback** — watched dir + admin upload of envelope `.json`
  files; **this is the day-one transport**

Envelope validation enforces I12: checksum match, known `feed_key`, tamper test
(source rows vs source totals — mismatch quarantines as *information*), PII
scan (I1), unknown feed keys quarantined. Idempotency by `delivery_id` (unique)
with `payload_sha256` correction/supersede semantics per VELUMA_FEED §2.
Failures go to `quarantine` with the raw envelope, never partially promote.
Ranged-run vs single-day collision handling per DATA_CONTRACT §5.

Parsers must preserve the distinction between footer totals (`is_total_row`)
and dimensional rows, and must refuse to synthesize rows (I3).

**Acceptance**
- Ingesting the 2026-08-19 envelope fixture set reproduces every golden value
  in DATA_CONTRACT §5 exactly, to the cent
- Redelivering the same `delivery_id` is a no-op; same feed/origin with a new
  `payload_sha256` supersedes the prior run and records `supersedes_run_id`
- A tampered envelope (checksum mismatch, or rows/totals disagreement)
  quarantines with zero rows promoted
- All three transports produce byte-identical `measure_fact` rows from the same
  envelope — proven by a shared test suite run against each transport
- Tenant identity is never sent as a header by the pull client (I13) —
  asserted by test
- D7's blocked envelope produces `ingest_run.status = 'blocked'`, not a failed
  run and not an empty success; a *missing* delivery is transport trouble and
  surfaces separately
- D8 ingests totals-only without inventing the 34 withheld technician rows

---

## P3 — Reconciliation and data quality
**Goal:** the app tells the truth about what it doesn't know. **This is the
phase that makes Sporacle trustworthy — do not compress it.**

Build:
- **Variance ledger** — for a given business date, all measures that plausibly
  answer "how much money" shown side by side with grain, date basis, source,
  and delta. No single headline number.
- **Hypothesis board** — H1–H6 seeded as `open`, each with its stated test and
  what data would settle it. Analysts can add hypotheses; only `admin` can
  promote, and promotion writes a `measure_definition` row with signer and date.
- **Provenance chip** — a shared UI primitive attached to every rendered figure
  (I4), exposing report code, business date, pulled-at, ingest run.
- **Data health page** — per source: status, last successful pull, staleness,
  quarantine count, blocked reason.

**Acceptance**
- The 8/19 variance ledger shows all five figures ($10,226 / $15,801.95 /
  $10,806 / $9,996 / $46,336) with D5 clearly labelled `booking_date`
- The app **never renders a figure labelled simply "Revenue"** — asserted by a
  Playwright test that crawls every route and fails on a bare revenue label
- Promoting H4 requires admin, writes a signed `measure_definition`, and is
  visible in an audit trail
- Every number on every page has a provenance chip — asserted by a DOM crawl
  test
- `facility_fill_pct` and `labor_utilization_pct_reported` render with an
  explicit "unvalidated / formula unknown" treatment

---

## P4 — Operational dashboards
**Goal:** what the data *can* honestly show today.

Build, each on a single measure family with no cross-source math:
- **Demand by hour** — appointment count and value by hour (D1). Peak marking.
- **Status mix** — booked / closed / cancelled / waitlist (D3). Cancellation
  value is the interesting number here: $4,521 on 8/19 against $9,996 closed.
- **Booking source mix** — ONLINE 8.87% vs SPA 91.13% (D5), on the booking-date
  axis, visually separated from service-date charts so they cannot be misread
  as the same day's business.
- **Occupancy** — services and value by facility (D4), with fill% flagged.
- **Turnaway** — n=1 today; must render as "insufficient data to characterize",
  not as "100% price-driven."

Charts render `null` gaps as gaps (I5). Date-basis is a visible label on every
chart, not a footnote.

**Acceptance**
- Every chart declares its date basis and measure key in the UI
- A service-date chart and a booking-date chart cannot be placed on the same
  axis — enforced by the chart component's types
- With the 14-day window loaded, series show 14 points; missing days are gaps
- Turnaway page shows the small-n warning
- No YoY control exists anywhere (I10)

---

## P5 — Labor and scheduling
**Goal:** restore the staffing dimension without restoring names.

Build: `technician_pseudonym` registry with stable IDs; ingest of
technician-weekly-schedule (2026-08-17→23 fixture); scheduled vs booked vs
serviced hours; coverage against the demand-by-hour curve to surface
over/under-staffed hours.

Report the three hour components separately and mark the composite 57% as
unverified until H6 resolves (DATA_CONTRACT §6).

**Acceptance**
- Pseudonym mapping table is unreachable from any analytics view — asserted by
  a query-layer test
- Totals reconcile to D8: 52 clients, 56.50 / 73.25 / 224.75 hours
- The app displays the three components and does **not** publish a computed
  utilization figure competing with the source's 57%
- Coverage view highlights hours where scheduled capacity and demand diverge

---

## P6 — Forward book and external feeds
**Goal:** be ready for the data that isn't here. *(Depends on P4; may run in
parallel with P5.)*

Build the adapter interface plus `not_configured` / `blocked` states for:
service & price master, price change history, hotel occupancy + group blocks,
forward bookings (1656), technician detail rows — all keyed to their Veluma
`feed_key`s (VELUMA_FEED §4).

Also in this phase, **Veluma transport goes live-capable**: the pull client and
webhook receiver built dark in P2 get their config screens (base URL, API key,
HMAC secret, poll interval), a connection test, and a transport health entry on
the data health page (last delivery, cursor position, signature failures).
Cutover from file-drop to live API must be config, not code.

Build the D7/1656 surface fully — it just renders its blocked state today, with
the reason, first-seen date, and who to chase. When the report is fixed
upstream, no new UI work should be required.

**Acceptance**
- Each missing feed has a working adapter, a config screen, and an honest
  empty state — and **zero synthetic rows**
- Veluma transport config screen exists with a working connection test; secrets
  are server-env only and never rendered back
- The forward-book page renders the block reason and blocked-since date
- Un-blocking D7 is an admin action that writes an audit record
- A hotel-occupancy envelope (`pms_hotel_occupancy`), dropped in, flows
  end-to-end without code changes

---

## P7 — Pricing workbench (gated)
**Goal:** the machinery, refusing to run.

Build the sufficiency gates page (DATA_CONTRACT §7) as a first-class screen
showing all seven gates, current values, and exactly what is needed to pass.
Build the elasticity/price-recommendation surface **behind** the gate — the
computation code exists, is unit-tested against synthetic data in the test
suite only, and the UI renders the failing-gate explanation instead of a number.

**Acceptance**
- With today's data, the workbench renders **no** price recommendation and
  **no** elasticity estimate — it renders the seven gates, all failing, with
  what would fix each
- Model code is unit-tested against synthetic fixtures and those fixtures never
  reach the database
- Forcing a render without passing gates is impossible through the UI and
  requires a code change, not a flag
- The gates page is linked from the main nav, not hidden

---

## P8 — Hardening and handover
**Goal:** a spa can run this. *(Depends on P7.)*

Build: RBAC enforcement tests across all routes; audit log for promotions,
un-blocks, and config changes; backup/restore runbook; ingest runbook for the
daily pull; onboarding doc for a non-technical operator; error surfaces that
name the fix.

**Acceptance**
- A `viewer` cannot promote a hypothesis, un-block a source, or change config —
  asserted per-route
- Audit log covers every state-changing admin action
- A restore-from-backup drill is documented and has been executed once
- A new operator can complete a daily ingest from the runbook alone
