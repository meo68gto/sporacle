import { canonicalPayloadJson, sha256Hex, type Envelope } from "../envelope";

const ORIGIN_BASE = {
  system: "book4time",
  location: "well-being-spa-fairmont-scottsdale",
  pulled_at: "2026-08-20T13:21:00Z",
};

function envelope(
  partial: Omit<Envelope, "payload_sha256" | "envelope_version"> & { envelope_version?: "1" },
): Envelope {
  const payload = partial.payload;
  return {
    envelope_version: "1",
    ...partial,
    payload,
    payload_sha256: sha256Hex(canonicalPayloadJson(payload)),
  };
}

const D1_ROWS = [
  { dimension_type: "hour", dimension_value: "9", measures: { appt_count: 4, appt_value_cents: 40000 } },
  { dimension_type: "hour", dimension_value: "10", measures: { appt_count: 7, appt_value_cents: 120000 } },
  { dimension_type: "hour", dimension_value: "11", measures: { appt_count: 6, appt_value_cents: 100000 } },
  { dimension_type: "hour", dimension_value: "12", measures: { appt_count: 5, appt_value_cents: 90000 } },
  { dimension_type: "hour", dimension_value: "13", measures: { appt_count: 8, appt_value_cents: 150000 } },
  { dimension_type: "hour", dimension_value: "14", measures: { appt_count: 11, appt_value_cents: 230200 } },
  { dimension_type: "hour", dimension_value: "15", measures: { appt_count: 9, appt_value_cents: 180000 } },
  { dimension_type: "hour", dimension_value: "16", measures: { appt_count: 5, appt_value_cents: 80000 } },
  { dimension_type: "hour", dimension_value: "17", measures: { appt_count: 4, appt_value_cents: 32400 } },
];

export const goldenD1 = envelope({
  delivery_id: "vlm_del_d1_20260819",
  feed_key: "b4t_appt_by_hour",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1421",
    report_name: "appointment-analysis-by-hour",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: D1_ROWS,
    totals: { appt_count: 59, appt_value_cents: 1_022_600 },
  },
});

const D2_ROWS = [
  { dimension_type: "hour", dimension_value: "10", measures: { pos_gross_cents: 180000, pos_clients: 8, pos_qty: 20 } },
  { dimension_type: "hour", dimension_value: "11", measures: { pos_gross_cents: 200000, pos_clients: 7, pos_qty: 18 } },
  { dimension_type: "hour", dimension_value: "12", measures: { pos_gross_cents: 190289, pos_clients: 8, pos_qty: 22 } },
  { dimension_type: "hour", dimension_value: "13", measures: { pos_gross_cents: 220000, pos_clients: 9, pos_qty: 24 } },
  { dimension_type: "hour", dimension_value: "14", measures: { pos_gross_cents: 210000, pos_clients: 9, pos_qty: 21 } },
  { dimension_type: "hour", dimension_value: "15", measures: { pos_gross_cents: 405906, pos_clients: 10, pos_qty: 25 } },
  { dimension_type: "hour", dimension_value: "16", measures: { pos_gross_cents: 174000, pos_clients: 8, pos_qty: 20 } },
];

export const goldenD2 = envelope({
  delivery_id: "vlm_del_d2_20260819",
  feed_key: "b4t_pos_sales_by_hour",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1412",
    report_name: "sales-by-hour",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "transaction_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: D2_ROWS,
    totals: { pos_gross_cents: 1_580_195, pos_clients: 59, pos_qty: 150 },
  },
});

export const goldenD3 = envelope({
  delivery_id: "vlm_del_d3_20260819",
  feed_key: "b4t_appt_by_status",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1253",
    report_name: "appointment-analysis-by-status",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [
      { dimension_type: "status", dimension_value: "booked", measures: { appt_count: 1, appt_value_cents: 23000 } },
      { dimension_type: "status", dimension_value: "closed", measures: { appt_count: 54, appt_value_cents: 999600 } },
      { dimension_type: "status", dimension_value: "cancelled", measures: { appt_count: 22, appt_value_cents: 452100 } },
      { dimension_type: "status", dimension_value: "waitlist", measures: { appt_count: 0, appt_value_cents: 0 } },
    ],
    totals: { appt_count: 77, appt_value_cents: 1_474_700 },
  },
});

export const goldenD4 = envelope({
  delivery_id: "vlm_del_d4_20260819",
  feed_key: "b4t_occupancy",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1524",
    report_name: "facility-occupancy-analysis",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [
      {
        dimension_type: "facility",
        dimension_value: "suite_a",
        measures: { service_count: 22, service_value_cents: 420000 },
      },
      {
        dimension_type: "facility",
        dimension_value: "suite_b",
        measures: { service_count: 20, service_value_cents: 360600 },
      },
      {
        dimension_type: "facility",
        dimension_value: "suite_c",
        measures: { service_count: 18, service_value_cents: 300000 },
      },
      {
        dimension_type: "hottest",
        dimension_value: "suite_a",
        measures: { fill_bps: 3448 },
      },
    ],
    totals: { service_count: 60, service_value_cents: 1_080_600, fill_bps: 373 },
  },
});

export const goldenD5 = envelope({
  delivery_id: "vlm_del_d5_20260819",
  feed_key: "b4t_booking_by_source",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1343",
    report_name: "booking-analysis-by-source",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "booking_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [
      { dimension_type: "source", dimension_value: "ONLINE", measures: { booking_count: 18, booking_value_cents: 497800 } },
      { dimension_type: "source", dimension_value: "SPA", measures: { booking_count: 185, booking_value_cents: 4135800 } },
      { dimension_type: "source", dimension_value: "MOBILE", measures: { booking_count: 0, booking_value_cents: 0 } },
    ],
    totals: { booking_count: 203, booking_value_cents: 4_633_600 },
  },
});

export const goldenD6 = envelope({
  delivery_id: "vlm_del_d6_20260819",
  feed_key: "b4t_turnaway",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: null,
    report_name: "turnaway-tracking",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [
      {
        dimension_type: "reason",
        dimension_value: "Price of Service",
        measures: { turnaway_count: 1, turnaway_value_cents: 14900 },
      },
    ],
    totals: { turnaway_count: 1, turnaway_value_cents: 14900 },
  },
});

export const goldenD7Blocked = envelope({
  delivery_id: "vlm_del_d7_20260819",
  feed_key: "b4t_future_revenues",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1656",
    report_name: "future-revenues",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "blocked",
  blocked_reason: "NullReferenceException",
  payload: { format: "b4t_report_rows_v1", rows: [], totals: {} },
});

export const goldenD8 = envelope({
  delivery_id: "vlm_del_d8_20260819",
  feed_key: "b4t_hours_work_summary",
  delivered_at: "2026-08-20T13:39:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: "1243",
    report_name: "hours-work-summary",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [],
    totals: {
      labor_client_count: 52,
      labor_service_hours_x100: 5650,
      labor_booked_hours_x100: 7325,
      labor_scheduled_hours_x100: 22475,
      labor_utilization_bps: 5700,
    },
  },
});

function dayEnvelope(
  date: string,
  delivery: string,
  counts: { appt_count: number; appt_value_cents: number },
): Envelope {
  return envelope({
    delivery_id: delivery,
    feed_key: "b4t_appt_by_hour",
    delivered_at: "2026-08-20T18:00:00Z",
    origin: {
      ...ORIGIN_BASE,
      report_code: "1421",
      report_name: "appointment-analysis-by-hour",
      business_date_from: date,
      business_date_to: date,
      date_basis: "service_date",
      pulled_at: "2026-08-20T18:00:00Z",
    },
    status: "ok",
    blocked_reason: null,
    payload: {
      format: "b4t_report_rows_v1",
      rows: [
        {
          dimension_type: "hour",
          dimension_value: "12",
          measures: { appt_count: counts.appt_count, appt_value_cents: counts.appt_value_cents },
        },
      ],
      totals: counts,
    },
  });
}

/** 14 calendar days 2026-08-07..20 with 2026-08-12 missing (gap, I5). 8/19 uses golden D1. */
export function rangedD1Window(): Envelope[] {
  const days = [
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
    "2026-08-11",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-20",
  ];
  return days.map((d, i) =>
    dayEnvelope(d, `vlm_del_d1_${d.replaceAll("-", "")}`, {
      appt_count: 40 + i,
      appt_value_cents: 800000 + i * 1000,
    }),
  );
}

export const goldenD9 = envelope({
  delivery_id: "vlm_del_d9_range",
  feed_key: "b4t_service_by_day",
  delivered_at: "2026-08-20T18:00:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: null,
    report_name: "service-analysis-by-day",
    business_date_from: "2026-08-07",
    business_date_to: "2026-08-20",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [
      { dimension_type: "day", dimension_value: "2026-08-19", measures: { service_count: 60, service_value_cents: 1080600 } },
      { dimension_type: "day", dimension_value: "2026-08-07", measures: { service_count: 50, service_value_cents: 900000 } },
    ],
    totals: { service_count: 110, service_value_cents: 1_980_600 },
  },
});

export const goldenD10 = envelope({
  delivery_id: "vlm_del_d10_range",
  feed_key: "b4t_tech_weekly_schedule",
  delivered_at: "2026-08-20T18:00:00Z",
  origin: {
    ...ORIGIN_BASE,
    report_code: null,
    report_name: "technician-weekly-schedule",
    business_date_from: "2026-08-17",
    business_date_to: "2026-08-23",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "b4t_report_rows_v1",
    rows: [
      { dimension_type: "technician", dimension_value: "tech_017", measures: { sched_shift_hours_x100: 8000 } },
      { dimension_type: "technician", dimension_value: "tech_018", measures: { sched_shift_hours_x100: 7500 } },
      { dimension_type: "technician", dimension_value: "tech_019", measures: { sched_shift_hours_x100: 6975 } },
    ],
    totals: { sched_shift_hours_x100: 22475 },
  },
});

export const goldenHotelOccupancy = envelope({
  delivery_id: "vlm_del_pms_sample",
  feed_key: "pms_hotel_occupancy",
  delivered_at: "2026-08-20T18:00:00Z",
  origin: {
    system: "fairmont_pms",
    report_code: null,
    report_name: "hotel-occupancy",
    location: "fairmont-scottsdale-princess",
    pulled_at: "2026-08-20T18:00:00Z",
    business_date_from: "2026-08-19",
    business_date_to: "2026-08-19",
    date_basis: "service_date",
  },
  status: "ok",
  blocked_reason: null,
  payload: {
    format: "pms_occupancy_v1",
    rows: [{ dimension_type: "property", dimension_value: "FSP", measures: { occupancy_bps: 7200, group_block_rooms: 40 } }],
    totals: { occupancy_bps: 7200, group_block_rooms: 40 },
  },
});

export const GOLDEN_DAY = [
  goldenD1,
  goldenD2,
  goldenD3,
  goldenD4,
  goldenD5,
  goldenD6,
  goldenD7Blocked,
  goldenD8,
] as const;
