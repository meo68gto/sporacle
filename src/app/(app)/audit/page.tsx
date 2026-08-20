import { desc } from "drizzle-orm";
import { getDb } from "@/lib/runtime";
import { auditEvent } from "@/db/schema";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";

export default async function AuditPage() {
  const user = await requireUser();
  if (!can(user, "view_audit")) {
    return (
      <>
        <h1>Audit</h1>
        <p>Admin only.</p>
      </>
    );
  }
  const db = await getDb();
  const rows = await db.select().from(auditEvent).orderBy(desc(auditEvent.at));
  return (
    <>
      <h1>Audit log</h1>
      <table>
        <thead>
          <tr>
            <th>At</th>
            <th>Actor</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.at.toISOString()}</td>
              <td>
                {r.actor} ({r.role})
              </td>
              <td>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
