# Sporacle

Internal operating tool for Well & Being Spa (Fairmont Scottsdale Princess). Next.js 15 + React 19 + Drizzle ORM + PGlite (embedded database — no external DB needed).

## How to run

Workflow `Start application`:

```
pnpm exec next dev --port 5000 --hostname 0.0.0.0
```

## Publishing

Configured for Autoscale:
- Build: `pnpm build`
- Run: `pnpm exec next start --port 5000 --hostname 0.0.0.0`

Autoscale supports the "Password protected" visibility option the user wants for sharing with Trish.

## Environment

`.env` copied from `.env.example` (dev defaults). Sign-in is allowlisted emails (see `AUTH_ALLOWLIST`): admin@sporacle.test, analyst@sporacle.test, viewer@sporacle.test.

## Notes

- Ports: dev scripts in package.json use 8787, but Replit preview/publish uses 5000 (overridden via workflow/deploy commands).
- Data flow: Book4Time → Veluma → Sporacle. Veluma live pull is config-only (`VELUMA_*` vars), file-drop works without them.
- Spec docs: `CLAUDE.md`, `BUILD_PLAN.md`, `docs/DATA_CONTRACT.md`, `docs/VELUMA_FEED.md`.
- `pnpm seed` seeds the database; `pnpm verify` runs typecheck + lint + tests.
