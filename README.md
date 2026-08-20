# Sporacle

Internal operating tool for Well & Being Spa at Fairmont Scottsdale Princess.

Book4Time remains the system of record. Files are automated into **Veluma**; Veluma feeds Sporacle. This repo does not talk to Book4Time and does not change Veluma.

```
Book4Time → Veluma → Sporacle
```

Day one, the same Veluma envelope can be file-dropped. Live pull/webhook is config (`VELUMA_*`), not a code change.

## Run

```bash
pnpm install
pnpm verify
pnpm dev          # http://localhost:8787
```

Allowlisted sign-in (override with `AUTH_ALLOWLIST`):

- `admin@sporacle.test`
- `analyst@sporacle.test`
- `viewer@sporacle.test`

## Spec

Read `CLAUDE.md`, `BUILD_PLAN.md`, `docs/DATA_CONTRACT.md`, `docs/VELUMA_FEED.md`. Phases: `tasks/P0`–`P8`.

There is no measure called revenue. The five 2026-08-19 money figures stay unmerged until a human promotes a hypothesis.
