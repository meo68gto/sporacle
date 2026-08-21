repo: meo68gto/sporacle
branch: main

## Last sync

date: 2026-08-20T18:52:00Z

### Updated in this project

- Recreated the current Next.js UI faithfully from `globals.css` and the `(app)` route pages.
- Added a luxury redesign of all ten screens on the Classical design system.
- Provenance chip, date-basis badge and five status treatments designed as a reusable system.
- All golden fixtures from DATA_CONTRACT §5 carried through unchanged.

## Screen map

| Project screen | Repo files |
| --- | --- |
| Sporacle Current UI.dc.html (all routes) | src/app/globals.css, src/components/Nav.tsx, src/components/Figure.tsx, src/components/ProvenanceChip.tsx, src/components/Spark.tsx, src/app/(app)/*/page.tsx |
| Sporacle.dc.html · Today | docs/DATA_CONTRACT.md §5 (new screen, no repo route) |
| Sporacle.dc.html · Variance ledger | src/app/(app)/variance/page.tsx, src/lib/reconciliation/variance.ts |
| Sporacle.dc.html · Hypothesis board | src/app/(app)/hypotheses/page.tsx, docs/DATA_CONTRACT.md §6 |
| Sporacle.dc.html · Demand by hour | src/app/(app)/demand/page.tsx, src/components/Spark.tsx |
| Sporacle.dc.html · Status mix | src/app/(app)/status/page.tsx |
| Sporacle.dc.html · Booking sources | src/app/(app)/booking-source/page.tsx |
| Sporacle.dc.html · Labor & coverage | src/app/(app)/labor/page.tsx, src/app/(app)/coverage/page.tsx |
| Sporacle.dc.html · Data health | src/app/(app)/health/page.tsx, src/app/(app)/feeds/page.tsx, src/app/(app)/veluma/page.tsx, src/app/(app)/forward-book/page.tsx, src/db/sources.ts |
| Sporacle.dc.html · Sufficiency gates | src/lib/gates.ts, src/app/(app)/gates/page.tsx |
| Sporacle.dc.html · Pricing workbench | src/app/(app)/pricing/page.tsx |
