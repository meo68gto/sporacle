# HANDOVER

## Current state

Next.js App Router ops app on `feat/spa-ops-app`. All nine phases in this tree: scaffold, schema, envelope ingest, variance/hypotheses, dashboards, labor, feed adapters, gated pricing, RBAC/audit/runbooks.

Local engine is **PGlite** (Postgres dialect) so `pnpm verify` is green on a clean checkout without Docker. Drizzle schema is `pg`. Pointing at Supabase later is a connection-string change, not a model change.

## Known limitations

- Live Veluma E13 API is not built (out of this repo). File-drop is the normal ingest path.
- Report 1656 is blocked upstream (`NullReferenceException` since 2026-08-20).
- Technician detail rows are withheld; D8 is totals-only.
- ~15 observations. August-only. No price master. No hotel occupancy until an envelope arrives.
- HMAC on `POST /api/ingest/veluma` is the Workforce contract already used by this org: `X-Veluma-Timestamp` + `X-Veluma-Signature` over `timestamp + "." + sha256(rawBody)`.

## Open hypotheses (all `open` until an admin promotes)

H1 booking_date vs service_date · H2 POS vs appointment mix · H3 60 vs 59 · H4 closed+booked = D1 · H5 fill% denominator · H6 57% formula.

Do not auto-promote H4.

## Blocked / missing feeds

- `b4t_future_revenues` blocked
- `pms_hotel_occupancy`, `b4t_service_price_master`, `b4t_price_change_history` not_configured

## When the collection plan lands

Drop envelopes into ingest (or enable `VELUMA_*`). Sufficiency gates are live from the database; the pricing page turns on only when all seven pass. No flag.
