# VELUMA_FEED.md — the Sporacle ↔ Veluma feed contract

Veluma (repo: `meo68gto/veluma` — FastAPI, Postgres/pgvector, Redis, MinIO) is
the middleware between Book4Time and Sporacle. This document defines the
delivery envelope both sides implement. It is the *only* coupling between the
two systems: Sporacle knows nothing about Veluma's internals, and Veluma knows
nothing about Sporacle's schema.

Governing invariants: **I12** (pass-through, never reconcile) and **I13**
(tenant from token, never from header). Read them in `CLAUDE.md` first.

---

## 1. Delivery model

Three transports, one envelope. The envelope is identical across all three, so
transports are swappable in config:

1. **Pull** — Sporacle polls `GET /feeds/{feed_key}/deliveries?since=<cursor>`
   on Veluma, authenticated with a Veluma API key scoped to Sporacle's
   workspace. Primary mode once Veluma E13 (public API + API keys) ships.
2. **Push** — Veluma POSTs envelopes to Sporacle's webhook receiver
   (`POST /api/ingest/veluma`), HMAC-signed with a shared secret. Optional;
   requires Veluma E13 webhooks.
3. **File-drop fallback** — the same envelope as a `.json` file in the watched
   intake directory (or admin upload). **This is the day-one mode**: Veluma's
   public feed API is Phase 4/E13 and not yet built. It also serves as the
   manual recovery path forever.

Sporacle must not care which transport delivered an envelope. `ingest_run`
records which one did.

## 2. The envelope

```jsonc
{
  "envelope_version": "1",
  "delivery_id": "vlm_del_01J...",        // unique per delivery attempt, Veluma-issued
  "feed_key": "b4t_appt_by_hour",         // stable feed identifier, see §4
  "delivered_at": "2026-08-20T13:39:00Z",

  "origin": {                              // pass-through, unmodified (I12)
    "system": "book4time",
    "report_code": "1421",                // null for sources without one
    "report_name": "appointment-analysis-by-hour",
    "location": "well-being-spa-fairmont-scottsdale",
    "pulled_at": "2026-08-20T13:21:00Z",  // when Veluma pulled from Book4Time
    "business_date_from": "2026-08-19",
    "business_date_to": "2026-08-19",
    "date_basis": "service_date"          // service_date | booking_date | transaction_date
  },

  "status": "ok",                          // ok | blocked | degraded
  "blocked_reason": null,                  // e.g. "NullReferenceException" for 1656

  "payload": {
    "format": "b4t_report_rows_v1",
    "rows": [
      { "dimension_type": "hour", "dimension_value": "14",
        "measures": { "appt_count": 11, "appt_value_cents": 230200 } }
    ],
    "totals": { "appt_count": 59, "appt_value_cents": 1022600 }
  },

  "payload_sha256": "..."                  // hash of canonical-JSON payload
}
```

Rules:

- **`origin` is verbatim.** Veluma copies these fields from the source export;
  it does not derive, correct, or normalize them beyond format transcoding.
- **Money is integer cents in the envelope** — the cents conversion is format
  transcoding and is the one transformation Veluma is allowed. Ratios as basis
  points, hours ×100, same units as Sporacle's schema.
- **`rows` + `totals` both present, both from the source.** Veluma never
  computes `totals` from `rows`. Sporacle's tamper test recomputes and rejects
  the delivery to quarantine if the source's own rows and totals disagree —
  that disagreement is *information*, and it must surface, not be smoothed.
- **A blocked report is a delivery**, `status: "blocked"` with the upstream
  error and an empty payload. Absence of deliveries means transport trouble;
  a blocked delivery means source trouble. Sporacle treats these differently.
- **`delivery_id` is the idempotency key.** Redelivery with the same id is a
  no-op. Same `feed_key` + `origin` + differing `payload_sha256` is a
  *correction*: ingested, superseding the prior run, and logged as such.
- No guest PII may appear in any envelope (I1 applies in transit too). The
  webhook receiver and file parser both scan for forbidden fields and
  quarantine on hit.

## 3. Auth

- **Pull**: Veluma API key in `Authorization: Bearer`, scoped to a dedicated
  Sporacle workspace in Veluma. Tenant identity is derived from the key on
  Veluma's side (`get_verified_tenant`) — Sporacle never sends a tenant header
  (I13).
- **Push**: HMAC-SHA256 signature over the raw body in `X-Veluma-Signature`,
  shared secret in server env. Reject on mismatch or on timestamp skew > 5 min.
- Secrets live in server env only; never in client bundles, never logged.

## 4. Feed registry

`feed_key` is stable and maps 1:1 to a Sporacle `source` row (DATA_CONTRACT §2):

| feed_key | Sporacle source | Origin report |
|---|---|---|
| `b4t_appt_by_hour` | D1 | 1421 |
| `b4t_pos_sales_by_hour` | D2 | 1412 |
| `b4t_appt_by_status` | D3 | 1253 |
| `b4t_occupancy` | D4 | 1524 |
| `b4t_booking_by_source` | D5 | 1343 |
| `b4t_turnaway` | D6 | — |
| `b4t_future_revenues` | D7 | 1656 (blocked upstream) |
| `b4t_hours_work_summary` | D8 | 1243 |
| `b4t_service_by_day` | D9 | TBC |
| `b4t_tech_weekly_schedule` | D10 | TBC |
| `pms_hotel_occupancy` | P6 adapter | Fairmont PMS (future) |
| `b4t_service_price_master` | P6 adapter | future |
| `b4t_price_change_history` | P6 adapter | future |

An envelope with an unknown `feed_key` quarantines; it never auto-creates a
source.

## 5. What this requires on the Veluma side

Sporacle's build does not depend on any of this shipping — the file-drop
fallback carries the pilot — but cutover to live transport needs, in Veluma:

1. **E13 public API + API keys** (already planned, Phase 4): the
   `GET /feeds/{feed_key}/deliveries` endpoint and key issuance.
2. **E13 webhooks** (already planned): HMAC-signed delivery push.
3. **A Book4Time source connector** producing this envelope. Veluma today has
   file ingest, a Postgres connector, and an S3/R2 connector; the Book4Time
   report exports would enter through file ingest or a new connector, and a
   small emitter maps them into `b4t_report_rows_v1`. **The emitter is
   transcoding-only** — cents conversion and JSON shaping, nothing else (I12).
4. **A dedicated Sporacle workspace** in Veluma with RLS-scoped access to only
   these feeds.
5. **Delivery retention** long enough for Sporacle to replay (suggest 90 days).

Track these as issues on the Veluma repo. Until they exist, whoever runs the
daily pull drops envelope files into Sporacle's intake — the P8 runbook
documents this as the normal procedure, with API cutover as an appendix.

## 6. What Veluma must NOT do

Restating I12 as a checklist, because middleware drift is how "do not force"
gets violated silently:

- No merging of sources; one envelope = one source report run
- No dedup across deliveries (that's Sporacle's job, with logging)
- No renaming of measures into "revenue" or any unified vocabulary
- No filling of gaps, interpolation, or zero-coalescing
- No date-basis conversion — 1343 stays `booking_date`, labelled as such
- No dropping of the cancelled/waitlist rows because they "aren't sales"
- No semantic-layer enrichment of these feeds — Veluma's chat/text-to-SQL
  features must not sit between Book4Time and Sporacle's `measure_fact`
