# P0 — Scaffold and guardrails

Read `CLAUDE.md` and `docs/DATA_CONTRACT.md` in full before starting. Do not
skim them; the invariants in §3 of CLAUDE.md are the point of this phase.

## Task

Stand up the Sporacle repo so that the rules are enforced before any feature
exists.

1. **App**: Next.js App Router, TypeScript with `strict: true` and
   `noUncheckedIndexedAccess: true`. pnpm. No `any` escape hatches; if you need
   one, ask first.
2. **Database**: Supabase local via the Supabase CLI. Drizzle for schema and
   migrations, wired to the local instance. No tables yet beyond what auth needs.
3. **Auth**: Supabase Auth, email allowlist (env-configured), three roles —
   `viewer`, `analyst`, `admin`. Single tenant. Do not scaffold from an auth
   template; keep it small and readable.
4. **Testing**: Vitest for unit/integration, Playwright for user paths, `tsd` or
   `expect-type` available for type-level negative tests (P1 needs it).
5. **`pnpm verify`**: typecheck + lint + unit tests + invariant checks, one
   command. CI runs it on every push.

6. **The invariant checks themselves** — build these now, while there is nothing
   to check:
   - **I1 forbidden-column test**: scan the Drizzle schema source for
     `name, first_name, last_name, guest, email, phone, address, card, pan, cvv,
     account_number, dob` as column identifiers. Any hit fails. (Auth's own user
     email is out of scope — scope the scan to the app schema directory.)
   - **I2/I3 vocabulary test**: fail the build if `revenue`, `totalSales`, or a
     bare `amount` appears as a column or measure identifier.
   - **`Money` branded type** in `lib/money.ts`: integer cents only, no float
     construction path, explicit `fromCents` / `toDisplay`.
   - **America/Phoenix business dates**: a `lib/date.ts` with a `BusinessDate`
     type. Phoenix has no DST — assert that in a test so a future library
     upgrade can't quietly introduce an offset.
   - **Env schema**: a Zod-validated server env module including the Veluma
     transport vars (`VELUMA_BASE_URL`, `VELUMA_API_KEY`,
     `VELUMA_WEBHOOK_SECRET`, `VELUMA_POLL_INTERVAL`), all optional at P0 —
     the app must boot without them (file-drop mode). A test asserts none of
     these are ever exposed to the client bundle (I13).

## Do not

- Add `tenant_id`, org switching, billing, signup, or marketing routes.
- Install a state manager, a heavyweight UI kit, or a charting library yet.
- Create any domain tables — that's P1.

## Acceptance criteria

- [ ] `pnpm verify` green on a clean checkout
- [ ] Adding a `guest_email` column to the app schema fails CI (demonstrate it,
      then revert)
- [ ] `/` requires auth; an off-allowlist email is rejected
- [ ] Roles exist and a route can be gated on them
- [ ] `grep -r "tenant_id" src/` returns nothing
- [ ] Phoenix/DST test passes

## When done

Write `docs/phase-notes/P0.md`: what you assumed, what you'd flag, anything in
CLAUDE.md that was ambiguous. Then stop — do not start P1.
