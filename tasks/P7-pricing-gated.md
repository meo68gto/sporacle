# P7 — Pricing workbench (gated)

Prerequisite: P6 passing.

**Read this section twice.** The success condition for this phase is that the
app produces *no pricing recommendation*. That is not a failure state — it is
the correct output given the current data, and building it so that it says so
clearly is the entire deliverable.

A real pricing decision for a real business hangs off this screen. A confident
wrong number here is materially worse than no number.

## Task

1. **Sufficiency gates page** — a first-class screen in the main nav, not a
   hidden dev tool. Renders all seven gates from `DATA_CONTRACT.md` §7 with
   current value, threshold, pass/fail, and precisely what would make it pass:

   | Gate | Threshold | Today |
   |---|---|---|
   | G1 observation count | ≥ 730 daily obs | ~15 |
   | G2 seasonal coverage | ≥ 24 months, all quarters | ~14 days, August only |
   | G3 price variation | ≥ 3 prices/service, ≥ 5% spread | 0 |
   | G4 service master | present, versioned | absent |
   | G5 revenue definition | ≥ 1 promoted definition | 0 |
   | G6 demand covariate | hotel occupancy present | absent |
   | G7 forward book | 1656 active | blocked |

   Gate values are computed from the database, not hardcoded — they must move
   on their own as data arrives.

2. **Model layer** — implement demand curve fitting and elasticity estimation as
   pure, well-tested functions. Unit-test them against synthetic fixtures inside
   the test suite. Those fixtures **never touch the database** and never render.

3. **Gated surface** — the pricing/elasticity page calls the gates first. If any
   gate fails, it renders the failing gates and their remedies. It does not
   render a number, a range, a confidence interval, or a "preliminary estimate."

4. **No override.** Forcing a render must require a code change, not a feature
   flag, an env var, or an admin toggle. If someone wants the number badly
   enough to edit source and open a PR, that's a conversation. A toggle is not.

## Context you should carry into the design

Why each gate exists, so you build them honestly rather than to spec:
- ~15 observations exist; seasonal resort demand needs 24–36 months
- August in Scottsdale is the least representative window in the year
- Without a service/price master, "is this service mispriced?" is *unanswerable*,
  not merely imprecise
- Without price variation, elasticity is **mathematically unidentifiable** —
  more data at one price never identifies it
- Without hotel occupancy, price takes the blame for hotel-driven demand swings

## Acceptance criteria

- [ ] Gates page is in the main nav and shows all seven gates computed live
- [ ] With today's data all seven fail, and the workbench renders **no**
      elasticity estimate and **no** price recommendation
- [ ] Model functions are unit-tested against synthetic fixtures; a test asserts
      no synthetic fixture reaches the database
- [ ] No UI path, flag, or env var can force a render past a failing gate —
      asserted by a test
- [ ] Seeding a database that satisfies all seven gates causes the workbench to
      render — proving the gate logic works in both directions
- [ ] `pnpm verify` green

## When done

`docs/phase-notes/P7.md`, then stop.
