import type { Db } from "@/db/client";
import { newId } from "@/db/ids";
import { auditEvent } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/roles";

export async function writeAudit(
  db: Db,
  user: SessionUser,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await db.insert(auditEvent).values({
    id: newId("aud"),
    actor: user.actor,
    role: user.role,
    action,
    beforeJson: before as object,
    afterJson: after as object,
    at: new Date(),
  });
}
