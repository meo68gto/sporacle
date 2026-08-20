import type { Db } from "./client";
import { source } from "./schema";

export const SOURCE_SEED = [
  {
    id: "src_d1",
    reportCode: "1421",
    key: "D1",
    label: "appointment-analysis-by-hour",
    grain: "appointment x hour",
    dateBasis: "service_date",
    status: "active",
    feedKey: "b4t_appt_by_hour",
  },
  {
    id: "src_d2",
    reportCode: "1412",
    key: "D2",
    label: "sales-by-hour (POS)",
    grain: "pos_txn x hour",
    dateBasis: "transaction_date",
    status: "active",
    feedKey: "b4t_pos_sales_by_hour",
  },
  {
    id: "src_d3",
    reportCode: "1253",
    key: "D3",
    label: "appointment-analysis-by-status",
    grain: "appointment x status",
    dateBasis: "service_date",
    status: "active",
    feedKey: "b4t_appt_by_status",
  },
  {
    id: "src_d4",
    reportCode: "1524",
    key: "D4",
    label: "facility-occupancy-analysis",
    grain: "service x facility",
    dateBasis: "service_date",
    status: "active",
    notes: "fill% unvalidated",
    feedKey: "b4t_occupancy",
  },
  {
    id: "src_d5",
    reportCode: "1343",
    key: "D5",
    label: "booking-analysis-by-source",
    grain: "booking x source",
    dateBasis: "booking_date",
    status: "active",
    feedKey: "b4t_booking_by_source",
  },
  {
    id: "src_d6",
    reportCode: null,
    key: "D6",
    label: "turnaway-tracking",
    grain: "turnaway event",
    dateBasis: "service_date",
    status: "active",
    notes: "n=1",
    feedKey: "b4t_turnaway",
  },
  {
    id: "src_d7",
    reportCode: "1656",
    key: "D7",
    label: "future-revenues",
    grain: "booking x future date",
    dateBasis: "service_date",
    status: "blocked",
    blockedReason: "NullReferenceException",
    blockedSince: "2026-08-20",
    feedKey: "b4t_future_revenues",
  },
  {
    id: "src_d8",
    reportCode: "1243",
    key: "D8",
    label: "hours-work-summary",
    grain: "technician x day",
    dateBasis: "service_date",
    status: "active",
    notes: "detail rows withheld",
    feedKey: "b4t_hours_work_summary",
  },
  {
    id: "src_d9",
    reportCode: null,
    key: "D9",
    label: "service-analysis-by-day",
    grain: "service x day",
    dateBasis: "service_date",
    status: "active",
    notes: "ranged 2026-08-07 to 2026-08-20; report code TBC",
    feedKey: "b4t_service_by_day",
  },
  {
    id: "src_d10",
    reportCode: null,
    key: "D10",
    label: "technician-weekly-schedule",
    grain: "technician x day",
    dateBasis: "service_date",
    status: "active",
    notes: "ranged 2026-08-17 to 2026-08-23; report code TBC",
    feedKey: "b4t_tech_weekly_schedule",
  },
] as const;

export const FEED_TO_SOURCE: Record<string, (typeof SOURCE_SEED)[number]["key"]> = Object.fromEntries(
  SOURCE_SEED.map((s) => [s.feedKey, s.key]),
);

export const EXTRA_ADAPTERS = [
  { feedKey: "pms_hotel_occupancy", status: "not_configured", notes: "Fairmont PMS — organizational ask" },
  { feedKey: "b4t_service_price_master", status: "not_configured", notes: "blocks G3/G4" },
  { feedKey: "b4t_price_change_history", status: "not_configured", notes: "blocks G3" },
] as const;

export async function seedSources(db: Db): Promise<void> {
  for (const s of SOURCE_SEED) {
    await db
      .insert(source)
      .values({
        id: s.id,
        reportCode: s.reportCode,
        key: s.key,
        label: s.label,
        grain: s.grain,
        dateBasis: s.dateBasis,
        status: s.status,
        blockedReason: "blockedReason" in s ? s.blockedReason : null,
        blockedSince: "blockedSince" in s ? s.blockedSince : null,
        notes: "notes" in s ? s.notes : null,
      })
      .onConflictDoNothing();
  }
}
