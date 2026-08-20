"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { source } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

export async function unblockAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "unblock_source")) return;
  const key = String(formData.get("key") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const db = await getDb();
  const before = (await db.select().from(source).where(eq(source.key, key)))[0];
  await db
    .update(source)
    .set({ status: "active", blockedReason: null, notes: `unblocked: ${reason}` })
    .where(eq(source.key, key));
  await writeAudit(db, user, "unblock_source", before, { key, reason });
  revalidatePath("/forward-book");
  revalidatePath("/health");
  revalidatePath("/feeds");
}
