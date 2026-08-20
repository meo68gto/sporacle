import type { FactRow } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";
import type { Provenance } from "@/lib/measures/types";
import { provenanceOf } from "@/lib/queries/facts";

export type VarianceLine = {
  sourceKey: string;
  reportCode: string | null;
  measureKey: string;
  grain: string;
  dateBasis: string;
  valueCents: number;
  display: string;
  provenance: Provenance;
  note?: string;
};

export function varianceLines(facts: FactRow[], businessDate: string): VarianceLine[] {
  const day = facts.filter((f) => f.businessDate === businessDate);
  const pick = (measureKey: string, extra: (f: FactRow) => boolean) =>
    day.find((f) => f.measureKey === measureKey && extra(f));

  const specs: Array<{
    sourceKey: string;
    measureKey: string;
    extra: (f: FactRow) => boolean;
    note?: string;
  }> = [
    { sourceKey: "D1", measureKey: "appt_value_by_hour", extra: (f) => f.isTotalRow },
    { sourceKey: "D2", measureKey: "pos_gross_sales_by_hour", extra: (f) => f.isTotalRow },
    { sourceKey: "D4", measureKey: "service_value_by_facility", extra: (f) => f.isTotalRow },
    {
      sourceKey: "D3",
      measureKey: "appt_value_by_status",
      extra: (f) => f.dimensionValue === "closed",
      note: "closed only — not a total of all statuses",
    },
    {
      sourceKey: "D5",
      measureKey: "booking_value_by_source",
      extra: (f) => f.isTotalRow,
      note: "booking_date basis — do not mix with service-date figures",
    },
  ];

  return specs.flatMap((spec) => {
    const row = pick(spec.measureKey, spec.extra);
    if (!row) return [];
    return [
      {
        sourceKey: spec.sourceKey,
        reportCode: row.reportCode,
        measureKey: spec.measureKey,
        grain: row.label,
        dateBasis: row.dateBasis,
        valueCents: row.valueNumeric,
        display: toDisplay(fromCents(row.valueNumeric)),
        provenance: provenanceOf(row),
        note: spec.note,
      },
    ];
  });
}
