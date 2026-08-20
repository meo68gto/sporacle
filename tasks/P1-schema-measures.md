# P1 — Schema and measure registry

Prerequisite: P0 acceptance criteria all passing.

Read `docs/DATA_CONTRACT.md` §2–§4 carefully. This phase is a transcription of
that document into code. Where the document is ambiguous, ask — do not choose.

## Task

1. **Tables**: implement every table in DATA_CONTRACT §4 exactly — `source`,
   `ingest_run`, `measure_fact`, `technician_pseudonym`,
   `reconciliation_hypothesis`, `measure_definition`, `sufficiency_check`,
   `quarantine`. Honour the unique constraint on `measure_fact`.

2. **Units**: money in integer cents, ratios in basis points, hours ×100 as
   integer. No floats in the schema at all. The `unit` column is an enum, not
   free text.

3. **Seed `source`** with the ten reports from DATA_CONTRACT §2, including
   D7/1656 as `status = 'blocked'`, `blocked_reason = 'NullReferenceException'`,
   `blocked_since = '2026-08-20'`.

4. **Measure registry as types** — this is the important part:
   ```ts
   type MeasureKey = 'appt_value_by_hour' | 'pos_gross_sales_by_hour' | ... ;
   type GrainOf<K extends MeasureKey> = ...        // mapped type
   type DateBasisOf<K extends MeasureKey> = ...    // mapped type
   type Measure<K extends MeasureKey> = { readonly [brand]: K; ... }
   ```
   Aggregation helpers (`sum`, `avg`, `ratio`) accept only a homogeneous
   `readonly Measure<K>[]`. Mixing keys must fail at compile time (I2).

5. **Negative type test**: a `tsd`/`expect-type` case asserting that
   `sum([apptValueByHour, posGrossSales])` does not typecheck. This runs in CI.

6. **Registry completeness test**: assert the `MeasureKey` union matches the
   registry table in DATA_CONTRACT §3 one-for-one, and that no key named
   `revenue` exists.

## Do not

- Add a convenience `revenue` view, a `total_amount` column, or any helper that
  sums across measure keys "just for the dashboard."
- Model report footers as transactions (I3). `is_total_row` is how a footer is
  represented.

## Acceptance criteria

- [ ] Migrations apply clean to an empty DB and roll back cleanly
- [ ] Seed yields 10 sources; D7 reads `blocked` with reason and date
- [ ] Cross-measure `sum` is a compile error, proven by a CI negative test
- [ ] Registry completeness test passes; no `revenue` measure exists
- [ ] No float columns anywhere — asserted by a schema test
- [ ] `pnpm verify` green

## When done

`docs/phase-notes/P1.md`, then stop.
