/**
 * I2 negative compile test. tsc must report an error on the @ts-expect-error
 * line. If mixed-key sum ever becomes legal, this file fails typecheck.
 */
import { measure } from "./types";
import { sum } from "./ops";
import type { Provenance } from "./types";

const provenance: Provenance = {
  reportCode: "1421",
  businessDate: "2026-08-19",
  pulledAt: "2026-08-20T13:21:00Z",
  ingestRunId: "run-neg",
  measureKey: "appt_value_by_hour",
  sourceKey: "D1",
};

const appt = measure({
  key: "appt_value_by_hour",
  value: 1_022_600,
  grain: "appointment",
  dateBasis: "service_date",
  unit: "cents",
  provenance,
});

const pos = measure({
  key: "pos_gross_sales_by_hour",
  value: 1_580_195,
  grain: "pos_txn",
  dateBasis: "transaction_date",
  unit: "cents",
  provenance: { ...provenance, measureKey: "pos_gross_sales_by_hour", sourceKey: "D2", reportCode: "1412" },
});

// @ts-expect-error I2: mixed measure keys cannot be summed
sum([appt, pos]);
