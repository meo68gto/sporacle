# P4 — Operational dashboards

Prerequisite: P3 passing.

Show only what the data honestly supports. Every chart is built on a single
measure family — no cross-source arithmetic (I2), no derived composites.

## Task

Five surfaces:

1. **Demand by hour** (D1/1421, `service_date`) — appointment count and value by
   hour, peak marked. 8/19: 59 appts / $10,226, peak 14:00 at 11 / $2,302.

2. **Status mix** (D3/1253, `service_date`) — booked / closed / cancelled /
   waitlist. Lead with cancellation value: 22 cancelled worth $4,521 against 54
   closed worth $9,996 is the operationally interesting fact on this page.

3. **Booking source mix** (D5/1343, **`booking_date`**) — ONLINE 18 / $4,978 /
   8.87%, SPA 185 / $41,358 / 91.13%, MOBILE 0. This page must be visually and
   structurally separated from the service-date pages so it cannot be misread as
   the same day's delivered business.

4. **Occupancy** (D4/1524, `service_date`) — 60 services / $10,806. Fill% shown
   with its unvalidated treatment from P3; it is not a headline metric.

5. **Turnaway** (D6) — n=1, $149, "Price of Service" 100%. This page must render
   "insufficient data to characterize turnaway" prominently. One record is not a
   pattern, and the 100% is an artifact of n=1. Do not draw a pie chart of it.

## Rules

- Every chart displays its **date basis** and **measure key** in the UI, not in
  a footnote.
- The chart component's types must make it impossible to place a `service_date`
  series and a `booking_date` series on one axis.
- `null` renders as a gap (I5). Never coalesce to zero, never interpolate.
- No year-over-year control anywhere (I10).
- Every figure keeps its provenance chip from P3.

## Acceptance criteria

- [ ] Each chart shows date basis and measure key on screen
- [ ] A type-level test proves mixed-basis charting doesn't compile
- [ ] With the 14-day window (8/07–8/20) loaded, series show 14 points; missing
      days render as gaps, not zeros
- [ ] Turnaway page shows the small-n warning and no percentage visualization
- [ ] No YoY affordance exists — asserted by a route crawl
- [ ] `pnpm verify` green

## When done

`docs/phase-notes/P4.md`, then stop.
