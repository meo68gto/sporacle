"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { promoteHypothesis } from "@/lib/reconciliation/hypotheses";
import { reconciliationHypothesis } from "@/db/schema";
import { newId } from "@/db/ids";
import { writeAudit } from "@/lib/audit";
import { activeFacts } from "@/lib/queries/facts";
import { latestDeliveredDay } from "@/lib/business-day";

export async function addHypothesisAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "add_hypothesis")) return;
  const db = await getDb();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  // I5 — the divergence day the board is anchored on is derived from what the
  // reports actually delivered (same derivation as the board's exhibit), never
  // hardcoded. If nothing has been delivered yet it stays null — a hypothesis
  // with no delivered day is about no particular day, not about a default one.
  const businessDate = latestDeliveredDay(await activeFacts(db), {
    measureKeys: ["appt_value_by_hour"],
    totalRowsOnly: true,
  });
  await db.insert(reconciliationHypothesis).values({
    id: newId("h"),
    businessDate,
    measureKeys: [],
    description,
    evidence: String(formData.get("evidence") ?? ""),
    proposedBy: user.actor,
    proposedAt: new Date(),
    status: "open",
    testPlan: String(formData.get("testPlan") ?? "unspecified"),
    missingData: String(formData.get("missingData") ?? "unspecified"),
  });
  await writeAudit(db, user, "add_hypothesis", null, { description });
  revalidatePath("/hypotheses");
}

export async function promoteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = String(formData.get("id") ?? "");
  await promoteHypothesis(db, user, id);
  revalidatePath("/hypotheses");
  revalidatePath("/gates");
}
