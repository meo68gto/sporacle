# Operator onboarding

Sporacle is a **read-only** view of spa reports. It does not book, charge, or write back to Book4Time.

## Why you see five money numbers

On 2026-08-19 five reports answered “how much money?” five ways:

| Source | Figure | What it actually is |
|---|---|---|
| D1 1421 | $10,226 | Appointment value by hour (service date) |
| D2 1412 | $15,801.95 | POS gross (transaction date) |
| D4 1524 | $10,806 | Services by facility (service date) |
| D3 1253 closed | $9,996 | Closed appointments only |
| D5 1343 | $46,336 | Bookings **created** that day (booking date) |

The app will not average these or pick a “revenue” number. That would be a lie. Hypotheses H1–H6 explain possible reasons; an admin can promote one into a signed definition.

## Why pricing is empty

There is not enough history, no price list, no hotel occupancy feed, and no signed revenue definition. The **Sufficiency gates** page lists exactly what would turn pricing on. Until then it shows no estimate on purpose.

## Fill % and utilization

- Occupancy fill 3.73% vs 34.48% “hottest”: denominator unverified. Not a headline.
- Labor 57%: does not match 56.50/224.75 or 73.25/224.75. Formula unknown. We show the three hour components instead.
