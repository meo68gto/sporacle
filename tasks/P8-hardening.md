# P8 — Hardening and handover

Prerequisite: P7 passing.

Goal: a spa can actually run this, and the person running it is not you.

## Task

1. **RBAC coverage** — a per-route test matrix asserting `viewer`, `analyst`,
   and `admin` each get exactly the access they should. Specifically: a `viewer`
   cannot promote a hypothesis, un-block a source, change adapter config, or
   trigger an ingest.

2. **Audit log** — every state-changing admin action recorded with actor,
   timestamp, before/after: hypothesis promotions, source un-blocks, adapter
   config changes, manual ingests, role changes. Viewable in the app by `admin`.

3. **Backup and restore** — documented procedure, and execute a restore drill
   once against a scratch environment. Note in the runbook how long it took.

4. **Daily ingest runbook** — written for a spa operations person, not an
   engineer. Documents **file-drop as the normal procedure** (where the Veluma
   envelope files come from, where they go, how to tell it worked, what to do
   when a report is blocked or a delivery quarantines), with **live Veluma API
   cutover as an appendix**: what to configure, how to run the connection test,
   and how to confirm the pull is replacing the manual drop.

5. **Operator onboarding doc** — what each screen means, what the five revenue
   figures are and why the app won't pick one, why the pricing page is empty and
   what would change that. This doc is how the tool avoids being misread.

6. **Error surfaces** — every user-visible error names the likely fix. "Ingest
   failed" is not acceptable; "Report 1421 file has 6 columns, expected 7 —
   re-export without the summary row" is.

## Acceptance criteria

- [ ] Per-route RBAC matrix test passes for all three roles
- [ ] Audit log covers every state-changing admin action — asserted by test
- [ ] Restore drill documented and executed once
- [ ] A person who has not seen the codebase can complete a daily ingest from
      the runbook alone (have someone try)
- [ ] Onboarding doc explains the five-figure variance and the empty pricing
      page in plain language
- [ ] `pnpm verify` green
- [ ] `pnpm build` produces a deployable artifact and deployment is documented

## When done

`docs/phase-notes/P8.md` plus a short `HANDOVER.md` at the repo root: current
state, known limitations, the open hypotheses, the blocked feeds, and what to do
next when the data collection plan lands.
