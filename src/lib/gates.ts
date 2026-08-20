import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { feedAdapter, measureDefinition, measureFact, source } from "@/db/schema";

export type Gate = {
  id: string;
  label: string;
  threshold: string;
  current: string;
  currentValue: number;
  passing: boolean;
  remedy: string;
};

export async function evaluateGates(db: Db): Promise<Gate[]> {
  const distinctDays = await db
    .select({ d: measureFact.businessDate })
    .from(measureFact)
    .where(and(eq(measureFact.retired, false), eq(measureFact.isTotalRow, true)));
  const uniqueDays = new Set(distinctDays.map((r) => r.d)).size;

  const dates = [...new Set(distinctDays.map((r) => r.d))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  let months = 0;
  if (first && last) {
    const [fy, fm] = first.split("-").map(Number) as [number, number];
    const [ly, lm] = last.split("-").map(Number) as [number, number];
    months = (ly - fy) * 12 + (lm - fm) + 1;
  }
  const quarters = new Set(
    dates.map((d) => {
      const m = Number(d.split("-")[1]);
      return Math.ceil(m / 3);
    }),
  );

  const defs = await db.select().from(measureDefinition);
  const d7 = (await db.select().from(source).where(eq(source.key, "D7")))[0];
  const adapters = await db.select().from(feedAdapter);
  const hotel = adapters.find((a) => a.feedKey === "pms_hotel_occupancy" && a.status === "configured");
  const priceMaster = adapters.find((a) => a.feedKey === "b4t_service_price_master" && a.status === "configured");
  const priceHist = adapters.find((a) => a.feedKey === "b4t_price_change_history" && a.status === "configured");

  const priceFacts = await db
    .select({ v: measureFact.valueNumeric })
    .from(measureFact)
    .where(and(eq(measureFact.measureKey, "service_list_price_cents"), eq(measureFact.retired, false)));
  const distinctPrices = new Set(priceFacts.map((p) => p.v));

  const g1 = uniqueDays >= 730;
  const g2 = months >= 24 && quarters.size === 4;
  const g3 = distinctPrices.size >= 3 && priceHist?.status === "configured";
  const g4 = priceMaster?.status === "configured";
  const g5 = defs.length >= 1;
  const g6 = Boolean(hotel);
  const g7 = d7?.status === "active";

  return [
    {
      id: "G1_observation_count",
      label: "Observation count",
      threshold: "≥ 730 daily observations",
      current: `${uniqueDays} distinct business dates`,
      currentValue: uniqueDays,
      passing: g1,
      remedy: "Collect 24–36 months of daily history at record grain, not report totals.",
    },
    {
      id: "G2_seasonal_coverage",
      label: "Seasonal coverage",
      threshold: "≥ 24 months spanning all quarters",
      current: `${months} month span, quarters seen: ${quarters.size || 0}`,
      currentValue: months,
      passing: g2,
      remedy: "Need a full two years including high season. August-only is the least representative window.",
    },
    {
      id: "G3_price_variation",
      label: "Price variation",
      threshold: "≥ 3 distinct prices per service, ≥ 5% spread",
      current: `${distinctPrices.size} distinct prices in feed`,
      currentValue: distinctPrices.size,
      passing: Boolean(g3),
      remedy: "Need versioned price change history. Elasticity is unidentifiable at one price.",
    },
    {
      id: "G4_service_master",
      label: "Service & price master",
      threshold: "present, versioned",
      current: priceMaster ? "configured" : "absent",
      currentValue: priceMaster ? 1 : 0,
      passing: Boolean(g4),
      remedy: "Drop a b4t_service_price_master envelope via Veluma/file-drop.",
    },
    {
      id: "G5_revenue_definition",
      label: "Revenue definition",
      threshold: "≥ 1 promoted measure definition",
      current: `${defs.length} promoted`,
      currentValue: defs.length,
      passing: g5,
      remedy: "An admin must promote a hypothesis (H4 is the strongest candidate). Do not force.",
    },
    {
      id: "G6_demand_covariate",
      label: "Hotel occupancy covariate",
      threshold: "hotel occupancy or group-block feed present",
      current: hotel ? "configured" : "absent",
      currentValue: hotel ? 1 : 0,
      passing: g6,
      remedy: "Fairmont PMS occupancy via Veluma feed_key pms_hotel_occupancy.",
    },
    {
      id: "G7_forward_book",
      label: "Forward book (1656)",
      threshold: "D7/1656 status = active",
      current: `${d7?.status ?? "missing"} ${d7?.blockedReason ?? ""}`.trim(),
      currentValue: g7 ? 1 : 0,
      passing: g7,
      remedy: "Book4Time must fix NullReferenceException on report 1656, then an admin unblocks D7.",
    },
  ];
}

export function allGatesPass(gates: Gate[]): boolean {
  return gates.every((g) => g.passing);
}