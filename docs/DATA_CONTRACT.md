# DATA_CONTRACT.md — Sporacle

The authoritative description of what Sporacle stores and what each number means.
Changes here are migrations, not edits.

---

## 0. Transport

All feeds arrive from **Veluma**, the middleware between Book4Time (and future
PMS/labor sources) and Sporacle. The delivery envelope, transports (API pull /
webhook push / file-drop fallback), auth, feed-key registry, and the
pass-through rules Veluma is held to are specified in **`docs/VELUMA_FEED.md`**.
Day one runs on the file-drop fallback; cutover to Veluma's live API is a
config change. Nothing in this document changes based on transport —
`origin.report_code`, `business_date`, and `date_basis` in the envelope are
verbatim from Book4Time (I12), so the source registry below keys on the report,
not on Veluma.

## 1. Core principle

Sporacle stores **claims made by reports**, not facts about the world.

A row in `measure_fact` says: *"Report 1421, run at 14:21 on 2026-08-20, covering
business date 2026-08-19, asserted that the hour 14:00 had 11 appointments worth
$2,302."* It does not say that $2,302 of revenue exists.

Reconciling claims into facts is a separate, human-authored layer (§6).

---

## 2. Source registry

Ten known Book4Time reports. `report_code` is the Book4Time report number and is
the stable key. D1–D8 appear in the daily pulse; D9–D10 arrive as ranged exports
and their report codes are not yet confirmed — confirm before hardcoding.

| Key | report_code | Name | Grain | Date basis | Status |
|---|---|---|---|---|---|
| D1 | 1421 | appointment-analysis-by-hour | appointment × hour | service_date | active |
| D2 | 1412 | sales-by-hour (POS) | pos_txn × hour | transaction_date | active |
| D3 | 1253 | appointment-analysis-by-status | appointment × status | service_date | active |
| D4 | 1524 | facility-occupancy-analysis | service × facility | service_date | active, fill% unvalidated |
| D5 | 1343 | booking-analysis-by-source | booking × source | **booking_date** | active |
| D6 | — | turnaway-tracking | turnaway event | service_date | active, n=1 |
| D7 | 1656 | future-revenues | booking × future date | service_date | **BLOCKED** |
| D8 | 1243 | hours-work-summary | technician × day | service_date | active, detail rows withheld |
| D9 | TBC | service-analysis-by-day | service × day | service_date | active, ranged (8/07–8/20) |
| D10 | TBC | technician-weekly-schedule | technician × day | service_date | active, ranged (8/17–8/23) |

`source.status ∈ { active, degraded, blocked, retired }`.
D7 is `blocked` with `blocked_reason = 'NullReferenceException'`,
`blocked_since = 2026-08-20`. It must not silently become `active` — clearing a
block is an explicit admin action with an audit record.

---

## 3. Measure registry

The registry is the heart of the system. `measure_key` is globally unique and
carries its grain and date basis in its identity. **There is no measure called
`revenue`.** Attempting to create one should fail review.

```
measure_key                          unit      grain        date_basis        source
---------------------------------------------------------------------------------------
appt_value_by_hour                   cents     appointment  service_date      D1 (1421)
appt_count_by_hour                   count     appointment  service_date      D1 (1421)
pos_gross_sales_by_hour              cents     pos_txn      transaction_date  D2 (1412)
pos_client_count                     count     pos_txn      transaction_date  D2 (1412)
pos_item_qty                         count     pos_line     transaction_date  D2 (1412)
appt_value_by_status                 cents     appointment  service_date      D3 (1253)
appt_count_by_status                 count     appointment  service_date      D3 (1253)
service_value_by_facility            cents     service      service_date      D4 (1524)
service_count_by_facility            count     service      service_date      D4 (1524)
facility_fill_pct                    ratio     facility     service_date      D4 (1524)  [UNVALIDATED]
booking_value_by_source              cents     booking      booking_date      D5 (1343)
booking_count_by_source              count     booking      booking_date      D5 (1343)
turnaway_value                       cents     turnaway     service_date      D6
turnaway_count                       count     turnaway     service_date      D6
labor_service_hours                  hours     technician   service_date      D8 (1243)
labor_booked_hours                   hours     technician   service_date      D8 (1243)
labor_scheduled_hours                hours     technician   service_date      D8 (1243)
labor_client_count                   count     technician   service_date      D8 (1243)
labor_utilization_pct_reported       ratio     technician   service_date      D8 (1243)  [FORMULA UNKNOWN]
future_booked_value                  cents     booking      service_date      D7 (1656)  [BLOCKED]
service_value_by_day                 cents     service      service_date      D9
service_count_by_day                 count     service      service_date      D9
sched_shift_hours                    hours     technician   service_date      D10
```

Type-level enforcement (I2):

```ts
declare const brand: unique symbol;
type Measure<K extends MeasureKey> = {
  readonly [brand]: K;
  value: number;
  grain: GrainOf<K>;
  dateBasis: DateBasisOf<K>;
  provenance: Provenance;
};

// sum() only accepts a homogeneous array of one measure key
function sum<K extends MeasureKey>(xs: readonly Measure<K>[]): Measure<K>;
```

`sum([apptValue, posGross])` must be a **compile error**, not a runtime warning.

---

## 4. Schema (Drizzle)

```
source
  id, report_code, key, name, grain, date_basis,
  status, blocked_reason, blocked_since, notes

ingest_run
  id, source_id, transport,          -- 'veluma_pull' | 'veluma_push' | 'file_drop'
  delivery_id,                       -- Veluma delivery id (idempotency key); null for legacy files
  feed_key,                          -- Veluma feed key, see docs/VELUMA_FEED.md §4
  payload_sha256, file_name,         -- file_name only for file_drop
  origin_pulled_at, delivered_at, business_date_from,
  business_date_to, parser_version, row_count, status, error,
  supersedes_run_id                  -- set when a correction replaces a prior delivery
  UNIQUE (delivery_id) WHERE delivery_id IS NOT NULL

measure_fact
  id, ingest_run_id, source_id, measure_key, business_date,
  dimension_type,        -- 'hour' | 'status' | 'source' | 'facility' | 'technician' | 'total'
  dimension_value,       -- '14', 'closed', 'ONLINE', 'tech_017', null for total
  value_numeric,         -- integer cents | count | basis-points for ratios
  unit,                  -- 'cents' | 'count' | 'hours_x100' | 'bps'
  is_total_row           -- true when this is the report footer
  UNIQUE (source_id, measure_key, business_date, dimension_type, dimension_value, ingest_run_id)

technician_pseudonym          -- ACCESS RESTRICTED, never joined into views
  pseudonym PK,              -- 'tech_017'
  source_identifier_hash,
  first_seen, last_seen

reconciliation_hypothesis
  id, business_date, measure_keys[], description, proposed_by,
  proposed_at, status ('open'|'promoted'|'rejected'), evidence

measure_definition            -- promoted hypotheses only
  id, name, sql_expression, rationale, signed_off_by, signed_off_at,
  supersedes_id

sufficiency_check
  id, model_key, check_name, threshold, current_value, passing, evaluated_at

quarantine
  id, ingest_run_id, reason, raw_payload, quarantined_at, resolved_at
```

Notes:
- Ratios stored as basis points (integer) to avoid float. `fill_pct = 373` = 3.73%.
- Hours stored ×100 as integer. `56.50h = 5650`.
- No `revenue` column anywhere. No `total_sales`. No `amount` without a measure key.

**Forbidden column-name test (I1).** CI greps the generated schema for:
`name, first_name, last_name, guest, email, phone, address, card, pan, cvv,
account_number, dob`. Any hit fails the build.

---

## 5. Known values — golden fixtures

These are the acceptance fixtures. Ingesting the 2026-08-19 files must
reproduce exactly these, and the reconciliation view must show all five
divergent figures side by side.

**Business date 2026-08-19:**

```
D1 1421  appt_count_by_hour     total = 59        appt_value_by_hour total = 1_022_600
         peak dimension_value '14' → count 11, value 230_200
D2 1412  pos_client_count       total = 59        pos_gross_sales_by_hour total = 1_580_195
         pos_item_qty total = 150
         peak dimension_value '15' → value 405_906
D3 1253  by status: booked  count 1  value  23_000
                    closed  count 54 value 999_600
                    cancelled count 22 value 452_100
                    waitlist count 0  value 0
D4 1524  service_count_by_facility total = 60   service_value_by_facility total = 1_080_600
         facility_fill_pct overall = 373 bps     hottest = 3448 bps   [UNVALIDATED]
D6       turnaway_count total = 1   turnaway_value total = 14_900
         reason 'Price of Service' 100%
D8 1243  labor_client_count 52
         labor_service_hours   5650
         labor_booked_hours    7325
         labor_scheduled_hours 22475
         labor_utilization_pct_reported 5700 bps   [FORMULA UNKNOWN]
         34 named technician rows withheld at source — expect totals only
D7 1656  ingest_run.status = 'blocked', error = 'NullReferenceException'
```

**Booking-date basis, 2026-08-19 (D5 1343) — different basis, do not mix:**

```
ONLINE  count 18   value   497_800   share  887 bps
SPA     count 185  value 4_135_800   share 9113 bps
MOBILE  count 0    value 0
TOTAL   count 203  value 4_633_600
```

**14-day window 2026-08-07 → 2026-08-20** exists for
appointment-analysis-by-hour, facility-occupancy-analysis, and
service-analysis-by-day. **Weekly window 2026-08-17 → 2026-08-23** exists for
technician-weekly-schedule. Ranged runs must not be double-counted against
single-day runs — dedupe by `(source_id, measure_key, business_date, dimension)`
keeping the most recent `pulled_at`, and log the collision.

---

## 6. Reconciliation

The app ships with these hypotheses **pre-seeded as `open`, affecting nothing**:

- **H1** — D5's $46,336 is ~4.5× the others because it is on `booking_date`:
  it counts forward bookings created on 8/19, not services delivered on 8/19.
  *Test:* if true, D5's 8/19 value should correlate with future service dates,
  not with 8/19 delivery. Requires D7 (blocked) to confirm.
- **H2** — D2's $15,801.95 exceeds D1's $10,226 because POS includes retail
  product, gratuity, and/or gift card sales that are not appointment value.
  *Test:* requires POS line-category detail, not currently exported.
- **H3** — D4's 60 services vs D1's 59 appointments differ because one
  appointment contained two services (or an add-on was recorded separately).
  *Test:* requires appointment→service line detail.
- **H4** — D3's closed $9,996 is the narrowest measure: delivered and settled
  only, excluding the 1 still-booked ($230) and all 22 cancelled ($4,521).
  Note 9,996 + 230 = 10,226 = D1 exactly. **This one is nearly arithmetic — but
  it still requires sign-off, not auto-promotion.**
- **H5** — D4's 3.73% fill uses a capacity denominator that includes unbookable
  or unstaffed rooms; the 34.48% "hottest" figure suggests the real utilized
  denominator is far smaller.
- **H6** — D8's reported 57% utilization matches neither 56.50/224.75 (25.1%)
  nor 73.25/224.75 (32.6%). A third denominator is in play, likely
  available-not-scheduled hours.

H4 is the strongest candidate for promotion. It is still not promoted
automatically. **Do not force.**

---

## 7. Sufficiency gates (I9)

Before any pricing/elasticity surface renders a number, all must pass:

| Gate | Threshold | Current | Status |
|---|---|---|---|
| `G1_observation_count` | ≥ 730 daily observations | ~15 | FAIL |
| `G2_seasonal_coverage` | ≥ 24 months spanning all quarters | ~14 days, Aug only | FAIL |
| `G3_price_variation` | ≥ 3 distinct prices per service, ≥ 5% spread | 0 (no price master) | FAIL |
| `G4_service_master` | present, versioned | absent | FAIL |
| `G5_revenue_definition` | ≥ 1 promoted `measure_definition` | 0 promoted | FAIL |
| `G6_demand_covariate` | hotel occupancy or group-block feed present | absent | FAIL |
| `G7_forward_book` | D7/1656 status = active | blocked | FAIL |

The gates page is a **real, always-visible screen**, not a hidden dev tool. It
is the honest answer to "can we make a pricing decision yet?" and it is arguably
the most useful thing Sporacle does in month one.

---

## 8. Feeds that do not exist yet

All will arrive through Veluma with the feed keys in `VELUMA_FEED.md` §4. Build
the adapter interface and a `status: 'not_configured'` state for each. Do not
stub with fake data.

- **Service & price master** (`b4t_service_price_master`) — blocks G3, G4
- **Price change history** (`b4t_price_change_history`) — blocks G3
- **Hotel occupancy + group blocks** (`pms_hotel_occupancy`, Fairmont PMS) —
  blocks G6. Organizational ask, long lead time; the adapter should be ready
  before the feed is. Veluma is the natural place to land the PMS connector —
  Sporacle just consumes the envelope.
- **Forward bookings / pace** (`b4t_future_revenues`, report 1656) — blocked
  upstream; blocks G7
- **Technician-level detail rows** (D8 currently totals-only) — blocks
  per-technician utilization

Also not yet built, on the **Veluma** side: the live feed API itself (E13 public
API + API keys + webhooks) and the Book4Time→envelope emitter — see
`VELUMA_FEED.md` §5. Until then, envelopes arrive by file drop.
