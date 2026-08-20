# CLAUDE.md — Sporacle

Read this file completely before writing any code. It overrides your defaults.

---

## 1. What this is

Sporacle is an **internal operating tool for one spa**: Well & Being Spa at the
Fairmont Scottsdale Princess. Single location, single tenant, staff users only.

It is **not** a SaaS product. Do not build multi-tenancy, org switching, billing,
signup flows, marketing pages, or a public API. If you find yourself adding a
`tenant_id`, stop — you are building the wrong product.

Its job, in order of importance:

1. Ingest Book4Time report exports without corrupting their meaning.
2. Make the spa's operational reality legible — occupancy, demand by hour,
   booking mix, labor utilization, turnaway.
3. Eventually support pricing and staffing decisions — **but only once the data
   can actually support them.** See §4.

### Data path

```
Book4Time (system of record)
   → Veluma (middleware — Michael's platform, repo: meo68gto/veluma)
      → Sporacle (this app)
```

**Sporacle's feed source is Veluma, not Book4Time directly.** Veluma is a
separate FastAPI/Postgres platform that ingests the Book4Time exports (and
later hotel/PMS and labor data) and delivers them to Sporacle over its API.
Sporacle never talks to Book4Time itself.

Two things follow, and both are load-bearing:

- **Veluma is transport, not truth.** Book4Time remains the system of record.
  Veluma must pass report payloads through unmodified — see I12 and
  `docs/VELUMA_FEED.md` for the contract.
- **Veluma's feed API does not fully exist yet** (it is Veluma Phase 4, Epic
  E13: public REST API, API keys, webhooks). Sporacle therefore ships with a
  file-drop fallback that accepts the same envelope from disk, so the build is
  never blocked on Veluma's roadmap, and cutover to the live API is a config
  change rather than a code change.

Sporacle is strictly read-only with respect to both upstream systems. It never
writes back, never books, never charges.

---

## 2. The single most important thing to understand

**The source data is printed report totals, not transaction records.**

Every file that arrives is the footer of a report someone ran. It is an
aggregate, already summarized, with a report-specific definition of what counts
as revenue and which date it belongs to.

Five different reports produced five different revenue figures for the same day
(2026-08-19):

| Report | Code | Figure | Count |
|---|---|---|---|
| appointment-analysis-by-hour | 1421 | $10,226.00 | 59 appts |
| sales-by-hour (POS) | 1412 | $15,801.95 | 59 clients, qty 150 |
| facility-occupancy-analysis | 1524 | $10,806 | 60 services |
| appointment-analysis-by-status (closed) | 1253 | $9,996 | 54 closed |
| booking-analysis-by-source | 1343 | $46,336 | 203 bookings |

These are **not errors to be averaged away**. They are five different measures.
The source note on this data says, verbatim: `Do not force.`

That instruction is binding. Sporacle must be architected so that reconciling
these is a deliberate, human-authored, auditable act — never an implicit
consequence of a `SUM()`.

---

## 3. Non-negotiable invariants

Each has an ID. Reference the ID in code comments and test names. A PR that
violates one does not merge, regardless of how well it works.

**I1 — No guest PII.** No guest names, emails, phones, addresses, payment
instruments, or card fragments in the schema, in fixtures, in logs, or in
memory. There is a test that greps the Drizzle schema for forbidden column
names and fails the build. Do not weaken it.

**I2 — No cross-source arithmetic.** Values may only be added, averaged, or
compared when they share the same `measure_key` **and** the same `grain` **and**
the same `date_basis`. Enforce this in the type system: a `Measure<K, G, B>` is
not assignable to `Measure<K2, G2, B2>`. Aggregation helpers take a phantom-typed
measure, not a `number[]`.

**I3 — Report totals are not records.** Never model a report footer as a
transaction, an appointment, or a line item. The fact table stores
`(report_code, business_date, dimension, measure_key, value)` — a claim made by
a report, attributed to that report. Fabricating synthetic per-appointment rows
from a total is prohibited.

**I4 — Every displayed number carries provenance.** Any figure rendered in the
UI must be traceable to `report_code`, `business_date`, `pulled_at`, and
`ingest_run_id`, and must expose that provenance on hover/inspect. A number with
no provenance is a bug.

**I5 — Absent is not zero.** Missing data is `null` and renders as
"Not available" with the reason. Never coalesce to 0. Never let a missing series
flatten a chart to the axis. A blocked report (see I8) renders as an explicit
blocked state, not an empty one.

**I6 — Date basis is always explicit.** Three distinct bases exist and must
never be conflated:
- `service_date` — when the service was delivered
- `booking_date` — when the booking was created
- `transaction_date` — when money moved in POS

Report 1343's $46,336 is on `booking_date`. That is the most likely reason it is
~4.5× the others — it counts forward bookings created that day, not services
delivered. **Record that as a hypothesis, not a fact** (see §5).

**I7 — Read-only upstream.** No write path to Book4Time or to Veluma's source
data. Sporacle may register/configure its own feed subscriptions in Veluma;
nothing else.

**I8 — Degraded sources are first-class.** Report 1656 (future revenues / on-the-
books pace) currently fails with a `NullReferenceException` upstream. It is the
single most valuable report for yield work and it is the broken one. The system
must model "this source is blocked" as a real state with a reason, a first-seen
date, and a UI treatment — not as absence.

**I9 — No model output without a sufficiency gate.** Any elasticity, forecast,
or pricing recommendation must pass an explicit, coded pre-condition check
before it renders. If the check fails, render the *reason it failed*, never a
number. Minimum bars: adequate observation count, observed price variation,
covered seasonality, and a resolved revenue definition. A confident wrong number
is worse than no number here — a real pricing decision hangs off it.

**I10 — 2026 is not a complete year.** No year-over-year comparison, no annual
run-rate, no "vs last year" until a verified prior-year series exists. Guard
this in code, not in a comment.

**I11 — Technicians are pseudonymous but joinable.** Technician identity is a
stable pseudonym (`tech_017`). The pseudonym↔name mapping lives in one
access-restricted table, is never joined into analytics views, and never leaves
the server. Stripping names entirely destroys the staffing dimension; hashing
them without a stable key destroys the join. Do neither.

**I12 — The middleware passes through; it never reconciles.** Veluma delivers
report payloads verbatim: original `report_code`, `business_date`, date basis,
row/total structure, and values, plus its own delivery metadata
(`delivery_id`, `feed_key`, `payload_sha256`, `delivered_at`). Veluma must not
aggregate, dedupe, merge sources, rename measures, or "fix" the five-way
revenue divergence in transit — *do not force* applies to the middleware
exactly as it applies to Sporacle. Sporacle verifies this: every delivery's
checksum is validated, and P2 carries a tamper test that rejects a payload
whose totals disagree with its rows. If a transformation is ever needed, it
happens in Sporacle where it is visible and audited — never in transit.

**I13 — Trust the token, not the header.** When consuming Veluma's
multi-tenant API, Sporacle's workspace/tenant identity comes from its own
credential (API key/JWT), pinned in server-side config. Never send or accept
tenant identity via a client-suppliable header. (Veluma has already had and
fixed an `X-Tenant-Id` header-trust vulnerability — do not reintroduce the
pattern from the consumer side.) The Veluma API key lives in server env only,
never in client code.

---

## 4. Build order discipline

The pricing model is the *last* thing built, not the first. The gap between what
the data currently supports and what a pricing recommendation requires is large
and known:

- ~15 usable observations exist (one day of hour detail, one 14-day window).
  Seasonal resort demand needs 24–36 months.
- August in Scottsdale is the least representative window in the year.
- No service/price master exists — "is this service mispriced?" is currently
  unanswerable, not merely hard.
- No price change history exists — without price variation, elasticity is
  mathematically unidentifiable, not just imprecise.
- No hotel occupancy or group-block feed exists. Resort spa demand is largely
  driven by hotel occupancy; without it, a model will attribute hotel-driven
  swings to price and recommend the wrong thing.

Build the machinery that will be correct when the data arrives. Do not build
something that produces a plausible-looking number today.

---

## 5. Hypotheses vs. definitions

Sporacle distinguishes them structurally.

- A **hypothesis** is a proposed explanation for a discrepancy. It lives in the
  `reconciliation_hypothesis` table, is visible in the UI as unconfirmed, and
  affects no computation.
- A **definition** is a human-signed-off rule that changes how measures are
  derived. Promoting a hypothesis to a definition requires an explicit record
  with an author and a date, and is a migration — not a config toggle.

The five-way revenue divergence stays a set of hypotheses until someone signs
off. The app is allowed — expected — to show the user five numbers and say it
does not know which one is "revenue."

---

## 6. Stack and conventions

- **Next.js** (App Router) + **TypeScript**, `strict: true`, `noUncheckedIndexedAccess: true`
- **Postgres via Supabase**; **Drizzle** for schema and migrations
- **Zod** at every boundary — file parse, form input, route handler
- **Vitest** for unit/integration; **Playwright** for the few real user paths
- **pnpm**; `pnpm verify` = typecheck + lint + test + invariant checks
- Server Components by default; Client Components only where interaction demands
- No ORM-level lazy loading. Queries are explicit and reviewed for N+1.
- Money is **integer cents**, never float. A `Money` branded type; no bare `number`.
- All timestamps stored UTC; all business dates are `date` in **America/Phoenix**
  (no DST — do not add DST handling, and do not let a library add it for you).

### Things not to do
- Do not add a charting library that requires client-side data fetching for
  server-derivable numbers.
- Do not install a heavyweight state manager. Server state via RSC + server
  actions; local UI state via `useState`.
- Do not scaffold auth from a template. Supabase Auth, email allowlist, three
  roles: `viewer`, `analyst`, `admin`.
- Do not generate seed data that looks like real guest activity. Fixtures are
  derived from the known report totals only.

---

## 7. Working agreement

- Work one phase at a time. Do not start phase N+1 until phase N's acceptance
  criteria pass.
- Every phase ends with `pnpm verify` green and a short written note of what was
  assumed.
- When the spec is ambiguous, **stop and ask** rather than choosing. Ambiguity
  here is usually a real unresolved business question, not a gap in the writing.
- When you disagree with a decision in this file, say so before implementing it.

---

## 8. Glossary

- **Fill %** — occupancy of bookable service capacity. Report 1524 reported
  3.73% overall with a "hottest" figure of 34.48% on the same run; the
  denominator is unverified. Treat overall fill as **unvalidated** until the
  capacity basis is confirmed. Do not put it on a dashboard as a headline.
- **Turnaway** — demand that arrived and was not served. Currently 1 record /
  $149, reason "Price of Service" at 100%. n=1; not a signal yet.
- **Utilization** — from report 1243: service hours 56.50, booked 73.25,
  scheduled 224.75, reported util 57%. The 57% does not equal 56.50/224.75
  (25%) nor 73.25/224.75 (33%). **The reported utilization formula is unknown.**
  Do not reimplement it by guessing; surface the components and mark the
  composite as unverified.
- **Pulse** — the daily read-only extract summary.
