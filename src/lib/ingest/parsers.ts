import type { Envelope } from "./envelope";
import type { MeasureKey, Unit } from "@/lib/measures/registry";
import { MEASURE_DEFS } from "@/lib/measures/registry";

export type ParsedFact = {
  measureKey: MeasureKey | string;
  businessDate: string;
  dimensionType: string;
  dimensionValue: string | null;
  valueNumeric: number;
  unit: Unit | string;
  isTotalRow: boolean;
};

type Mapping = Record<string, MeasureKey | string>;

const MAP: Record<string, Mapping> = {
  b4t_appt_by_hour: { appt_count: "appt_count_by_hour", appt_value_cents: "appt_value_by_hour" },
  b4t_pos_sales_by_hour: {
    pos_gross_cents: "pos_gross_sales_by_hour",
    pos_clients: "pos_client_count",
    pos_qty: "pos_item_qty",
  },
  b4t_appt_by_status: { appt_count: "appt_count_by_status", appt_value_cents: "appt_value_by_status" },
  b4t_occupancy: {
    service_count: "service_count_by_facility",
    service_value_cents: "service_value_by_facility",
    fill_bps: "facility_fill_pct",
  },
  b4t_booking_by_source: {
    booking_count: "booking_count_by_source",
    booking_value_cents: "booking_value_by_source",
  },
  b4t_turnaway: { turnaway_count: "turnaway_count", turnaway_value_cents: "turnaway_value" },
  b4t_hours_work_summary: {
    labor_client_count: "labor_client_count",
    labor_service_hours_x100: "labor_service_hours",
    labor_booked_hours_x100: "labor_booked_hours",
    labor_scheduled_hours_x100: "labor_scheduled_hours",
    labor_utilization_bps: "labor_utilization_pct_reported",
  },
  b4t_future_revenues: { future_value_cents: "future_booked_value" },
  b4t_service_by_day: { service_count: "service_count_by_day", service_value_cents: "service_value_by_day" },
  b4t_tech_weekly_schedule: { sched_shift_hours_x100: "sched_shift_hours" },
  pms_hotel_occupancy: { occupancy_bps: "hotel_occupancy_bps", group_block_rooms: "hotel_group_block_rooms" },
  b4t_service_price_master: { list_price_cents: "service_list_price_cents" },
  b4t_price_change_history: { list_price_cents: "service_list_price_cents" },
};

function unitFor(key: string): Unit | string {
  if (key in MEASURE_DEFS) return MEASURE_DEFS[key as MeasureKey].unit;
  if (key.endsWith("_cents") || key.includes("price")) return "cents";
  if (key.endsWith("_bps")) return "bps";
  if (key.includes("hours")) return "hours_x100";
  return "count";
}

export function parseEnvelopeFacts(envelope: Envelope): ParsedFact[] {
  const mapping = MAP[envelope.feed_key];
  if (!mapping) return [];
  const facts: ParsedFact[] = [];
  const dateFrom = envelope.origin.business_date_from;

  for (const row of envelope.payload.rows) {
    const businessDate = row.dimension_type === "day" && row.dimension_value ? row.dimension_value : dateFrom;
    for (const [rawKey, value] of Object.entries(row.measures)) {
      const measureKey = mapping[rawKey];
      if (!measureKey) continue;
      facts.push({
        measureKey,
        businessDate,
        dimensionType: row.dimension_type,
        dimensionValue: row.dimension_value,
        valueNumeric: value,
        unit: unitFor(measureKey),
        isTotalRow: false,
      });
    }
  }

  for (const [rawKey, value] of Object.entries(envelope.payload.totals)) {
    const measureKey = mapping[rawKey];
    if (!measureKey) continue;
    facts.push({
      measureKey,
      businessDate: dateFrom,
      dimensionType: "total",
      dimensionValue: null,
      valueNumeric: value,
      unit: unitFor(measureKey),
      isTotalRow: true,
    });
  }
  return facts;
}
