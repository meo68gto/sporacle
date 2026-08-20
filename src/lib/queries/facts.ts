import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { ingestRun, measureFact, source } from "@/db/schema";
import type { MeasureKey } from "@/lib/measures/registry";
import type { Provenance } from "@/lib/measures/types";

/** Analytics query layer. Must not import the restricted mapping table (I11). */

export type FactRow = {
  measureKey: string;
  businessDate: string;
  dimensionType: string;
  dimensionValue: string | null;
  valueNumeric: number;
  unit: string;
  isTotalRow: boolean;
  sourceKey: string;
  reportCode: string | null;
  dateBasis: string;
  ingestRunId: string;
  pulledAt: string;
  label: string;
};

export async function activeFacts(db: Db, opts?: { measureKey?: string; businessDate?: string }): Promise<FactRow[]> {
  const rows = await db
    .select({
      measureKey: measureFact.measureKey,
      businessDate: measureFact.businessDate,
      dimensionType: measureFact.dimensionType,
      dimensionValue: measureFact.dimensionValue,
      valueNumeric: measureFact.valueNumeric,
      unit: measureFact.unit,
      isTotalRow: measureFact.isTotalRow,
      ingestRunId: measureFact.ingestRunId,
      sourceKey: source.key,
      reportCode: source.reportCode,
      dateBasis: source.dateBasis,
      label: source.label,
      pulledAt: ingestRun.originPulledAt,
    })
    .from(measureFact)
    .innerJoin(source, eq(measureFact.sourceId, source.id))
    .innerJoin(ingestRun, eq(measureFact.ingestRunId, ingestRun.id))
    .where(
      and(
        eq(measureFact.retired, false),
        opts?.measureKey ? eq(measureFact.measureKey, opts.measureKey) : undefined,
        opts?.businessDate ? eq(measureFact.businessDate, opts.businessDate) : undefined,
      ),
    );
  return rows.map((r) => ({
    ...r,
    pulledAt: r.pulledAt?.toISOString() ?? "",
  }));
}

export function provenanceOf(row: FactRow): Provenance {
  return {
    reportCode: row.reportCode,
    businessDate: row.businessDate,
    pulledAt: row.pulledAt,
    ingestRunId: row.ingestRunId,
    measureKey: row.measureKey as MeasureKey,
    sourceKey: row.sourceKey,
  };
}

export const MONEY_TOTALS_FOR_VARIANCE: { measureKey: MeasureKey; sourceKey: string }[] = [
  { measureKey: "appt_value_by_hour", sourceKey: "D1" },
  { measureKey: "pos_gross_sales_by_hour", sourceKey: "D2" },
  { measureKey: "service_value_by_facility", sourceKey: "D4" },
  { measureKey: "appt_value_by_status", sourceKey: "D3" },
  { measureKey: "booking_value_by_source", sourceKey: "D5" },
];
