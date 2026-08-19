# Sporacle

Spa + Oracle. Soft tech. Real presence.

Temporary preview for Destination AI × **& being** (Trish’s spa), plus a Veluma HMAC ingest so hotel spa bookings and spa-guest profiles can land here without Sporacle becoming a CDP.

Veluma is middleware. Hotel CDP owns the golden profile. Guest Action is hotel-wide comms. **Sporacle is the spa/oracle surface.**

## Preview site

Open `index.html`, or `npm start` and visit http://localhost:8787.

## Veluma feed

```bash
export VELUMA_WEBHOOK_SECRET='<same signing_secret as the Veluma delivery target>'
npm start   # POST /api/integrations/veluma/events  GET /healthz
npm test
```

HMAC is the Veluma Workforce contract: `X-Veluma-Timestamp` + `X-Veluma-Signature` over `timestamp + "." + sha256(rawBody)`.

`profile.upsert` merges spa guests by email/loyalty. `spa.*` and `outlet.*` events become bookings. Everything else is stored.

Events persist under `data/` (gitignored). Override with `SPORACLE_DATA_DIR`.
