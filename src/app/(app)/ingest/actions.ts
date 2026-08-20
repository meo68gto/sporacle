"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { ingestEnvelope } from "@/lib/ingest/pipeline";
import { writeAudit } from "@/lib/audit";

export async function ingestFileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "ingest")) return;
  const raw = String(formData.get("envelope") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const db = await getDb();
  const result = await ingestEnvelope(db, parsed, "file_drop", "admin-upload");
  await writeAudit(db, user, "manual_ingest", null, result);
  revalidatePath("/health");
  revalidatePath("/variance");
}
