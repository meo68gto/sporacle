# Deploy

`pnpm build` produces a Next.js standalone-capable app. Set:

- `AUTH_SECRET`
- `AUTH_ALLOWLIST`
- `SPORACLE_DATA_DIR` (persistent volume)
- optional `VELUMA_*`

Do not expose Veluma secrets to the browser. The env module is `server-only`.
