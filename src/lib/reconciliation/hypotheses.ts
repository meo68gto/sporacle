import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { newId } from "@/db/ids";
import { measureDefinition, reconciliationHypothesis } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/roles";
import { can } from "@/lib/auth/roles";

export const HYPOTHESIS_SEED = [
  {
    id: "h1",
    description:
      "D5's $46,336 is ~4.5× the others because it is on booking_date: it counts forward bookings created on 8/19, not services delivered on 8/19.",
    testPlan:
      "If true, D5's 8/19 value should correlate with future service dates, not with 8/19 delivery. Requires D7 (blocked) to confirm.",
    missingData: "Report 1656 / b4t_future_revenues (blocked)",
    measureKeys: ["booking_value_by_source", "appt_value_by_hour"],
  },
  {
    id: "h2",
    description:
      "D2's $15,801.95 exceeds D1's $10,226 because POS includes retail product, gratuity, and/or gift card sales that are not appointment value.",
    testPlan: "Requires POS line-category detail, not currently exported.",
    missingData: "POS line-category detail",
    measureKeys: ["pos_gross_sales_by_hour", "appt_value_by_hour"],
  },
  {
    id: "h3",
    description:
      "D4's 60 services vs D1's 59 appointments differ because one appointment contained two services (or an add-on was recorded separately).",
    testPlan: "Requires appointment→service line detail.",
    missingData: "appointment-to-service line detail",
    measureKeys: ["service_count_by_facility", "appt_count_by_hour"],
  },
  {
    id: "h4",
    description:
      "D3's closed $9,996 is the narrowest measure: delivered and settled only, excluding the 1 still-booked ($230) and all 22 cancelled ($4,521). 9,996 + 230 = 10,226 = D1 exactly. Still requires sign-off, not auto-promotion.",
    testPlan: "Arithmetic identity already holds on 8/19 totals. Promotion is a human definition choice.",
    missingData: "Signed-off revenue definition (G5)",
    measureKeys: ["appt_value_by_status", "appt_value_by_hour"],
  },
  {
    id: "h5",
    description:
      "D4's 3.73% fill uses a capacity denominator that includes unbookable or unstaffed rooms; the 34.48% hottest figure suggests the real utilized denominator is far smaller.",
    testPlan: "Confirm capacity basis with spa operations.",
    missingData: "Capacity denominator definition",
    measureKeys: ["facility_fill_pct"],
  },
  {
    id: "h6",
    description:
      "D8's reported 57% utilization matches neither 56.50/224.75 (25.1%) nor 73.25/224.75 (32.6%). A third denominator is in play, likely available-not-scheduled hours.",
    testPlan: "Obtain the report 1243 utilization formula from Book4Time.",
    missingData: "Utilization formula",
    measureKeys: ["labor_utilization_pct_reported", "labor_service_hours", "labor_booked_hours", "labor_scheduled_hours"],
  },
] as const;

export async function seedHypotheses(db: Db): Promise<void> {
  const existing = await db.select().from(reconciliationHypothesis);
  if (existing.length > 0) return;
  const at = new Date("2026-08-20T00:00:00Z");
  for (const h of HYPOTHESIS_SEED) {
    await db.insert(reconciliationHypothesis).values({
      id: h.id,
      businessDate: "2026-08-19",
      measureKeys: [...h.measureKeys],
      description: h.description,
      evidence: null,
      proposedBy: "system",
      proposedAt: at,
      status: "open",
      testPlan: h.testPlan,
      missingData: h.missingData,
    });
  }
}

export async function promoteHypothesis(db: Db, user: SessionUser, hypothesisId: string): Promise<{ ok: boolean; error?: string }> {
  if (!can(user, "promote_hypothesis")) return { ok: false, error: "forbidden" };
  const rows = await db.select().from(reconciliationHypothesis).where(eq(reconciliationHypothesis.id, hypothesisId));
  const hyp = rows[0];
  if (!hyp) return { ok: false, error: "not_found" };
  if (hyp.status === "promoted") return { ok: false, error: "already_promoted" };
  const defId = newId("def");
  const at = new Date();
  await db.insert(measureDefinition).values({
    id: defId,
    defLabel: `promoted:${hypothesisId}`,
    sqlExpression: `-- signed definition from ${hypothesisId}; not an auto SUM across sources`,
    rationale: hyp.description,
    signedOffBy: user.actor,
    signedOffAt: at,
    hypothesisId,
  });
  await db.update(reconciliationHypothesis).set({ status: "promoted" }).where(eq(reconciliationHypothesis.id, hypothesisId));
  await writeAudit(db, user, "promote_hypothesis", hyp, { id: defId, hypothesisId, signedOffBy: user.actor });
  return { ok: true };
}
