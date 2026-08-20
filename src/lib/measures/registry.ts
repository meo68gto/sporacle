export const DATE_BASES = ["service_date", "booking_date", "transaction_date"] as const;
export type DateBasis = (typeof DATE_BASES)[number];

export const GRAINS = [
  "appointment",
  "pos_txn",
  "pos_line",
  "service",
  "booking",
  "turnaway",
  "technician",
  "facility",
] as const;
export type Grain = (typeof GRAINS)[number];

export const UNITS = ["cents", "count", "hours_x100", "bps"] as const;
export type Unit = (typeof UNITS)[number];

export const MEASURE_DEFS = {
  appt_value_by_hour: { unit: "cents", grain: "appointment", dateBasis: "service_date", sourceKey: "D1" },
  appt_count_by_hour: { unit: "count", grain: "appointment", dateBasis: "service_date", sourceKey: "D1" },
  pos_gross_sales_by_hour: { unit: "cents", grain: "pos_txn", dateBasis: "transaction_date", sourceKey: "D2" },
  pos_client_count: { unit: "count", grain: "pos_txn", dateBasis: "transaction_date", sourceKey: "D2" },
  pos_item_qty: { unit: "count", grain: "pos_line", dateBasis: "transaction_date", sourceKey: "D2" },
  appt_value_by_status: { unit: "cents", grain: "appointment", dateBasis: "service_date", sourceKey: "D3" },
  appt_count_by_status: { unit: "count", grain: "appointment", dateBasis: "service_date", sourceKey: "D3" },
  service_value_by_facility: { unit: "cents", grain: "service", dateBasis: "service_date", sourceKey: "D4" },
  service_count_by_facility: { unit: "count", grain: "service", dateBasis: "service_date", sourceKey: "D4" },
  facility_fill_pct: { unit: "bps", grain: "facility", dateBasis: "service_date", sourceKey: "D4", unvalidated: true },
  booking_value_by_source: { unit: "cents", grain: "booking", dateBasis: "booking_date", sourceKey: "D5" },
  booking_count_by_source: { unit: "count", grain: "booking", dateBasis: "booking_date", sourceKey: "D5" },
  turnaway_value: { unit: "cents", grain: "turnaway", dateBasis: "service_date", sourceKey: "D6" },
  turnaway_count: { unit: "count", grain: "turnaway", dateBasis: "service_date", sourceKey: "D6" },
  labor_service_hours: { unit: "hours_x100", grain: "technician", dateBasis: "service_date", sourceKey: "D8" },
  labor_booked_hours: { unit: "hours_x100", grain: "technician", dateBasis: "service_date", sourceKey: "D8" },
  labor_scheduled_hours: { unit: "hours_x100", grain: "technician", dateBasis: "service_date", sourceKey: "D8" },
  labor_client_count: { unit: "count", grain: "technician", dateBasis: "service_date", sourceKey: "D8" },
  labor_utilization_pct_reported: {
    unit: "bps",
    grain: "technician",
    dateBasis: "service_date",
    sourceKey: "D8",
    formulaUnknown: true,
  },
  future_booked_value: { unit: "cents", grain: "booking", dateBasis: "service_date", sourceKey: "D7" },
  service_value_by_day: { unit: "cents", grain: "service", dateBasis: "service_date", sourceKey: "D9" },
  service_count_by_day: { unit: "count", grain: "service", dateBasis: "service_date", sourceKey: "D9" },
  sched_shift_hours: { unit: "hours_x100", grain: "technician", dateBasis: "service_date", sourceKey: "D10" },
} as const;

export type MeasureKey = keyof typeof MEASURE_DEFS;
export type GrainOf<K extends MeasureKey> = (typeof MEASURE_DEFS)[K]["grain"];
export type DateBasisOf<K extends MeasureKey> = (typeof MEASURE_DEFS)[K]["dateBasis"];
export type UnitOf<K extends MeasureKey> = (typeof MEASURE_DEFS)[K]["unit"];

export const MEASURE_KEYS = Object.keys(MEASURE_DEFS) as MeasureKey[];

export function isMeasureKey(value: string): value is MeasureKey {
  return value in MEASURE_DEFS;
}

export const FORBIDDEN_MEASURE_IDS = ["revenue", "totalSales", "amount", "total_sales", "total_amount"] as const;
