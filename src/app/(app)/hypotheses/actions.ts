"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { promoteHypothesis } from "@/lib/reconciliation/hypotheses";
import { reconciliationHypothesis } from "@/db/schema";
import { newId } from "@/db/ids";
import { writeAudit } from "@/lib/audit";

export async function addHypothesisAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "add_hypothesis")) return;
  const db = await getDb();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  await db.insert(reconciliationHypothesis).values({
    id: newId("h"),
    businessDate: "2026-08-19",
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
