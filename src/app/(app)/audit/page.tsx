import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { auditEvent } from "@/db/schema";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";

/**
 * Audit log (admin). Not one of the ten designed screens — styled with the
 * same idioms. Promotions, ingests, unblocks and configuration changes,
 * newest first.
 */

const heading: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
};

function utc(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default async function AuditPage() {
  const user = await requireUser();
  if (!can(user, "view_audit")) {
    return (
      <>
        <PageHeader kicker="Admin · signed actions" title="Audit log" lede="Admin only." />
        <section className="panel">
          <p className="note" style={{ margin: 0 }}>
            The audit log is admin-only. You are signed in as {user.role}.
          </p>
        </section>
      </>
    );
  }

  const db = await getDb();
  const rows = await db.select().from(auditEvent).orderBy(desc(auditEvent.at));

  return (
    <>
      <PageHeader
        kicker="Admin · signed actions"
        title="Audit log"
        lede="Every promotion, manual ingest, unblock and configuration change, attributed to its actor. Timestamps are stored UTC. Promoting a hypothesis to a definition is a migration with an author and a date — this is where that trail lives."
      />

      <div className="table-wrap">
        <div className="table-wrap-head">
          <h2 style={{ ...heading, fontSize: 22, margin: 0 }}>Events, newest first</h2>
          <p className="note" style={{ margin: "4px 0 0" }}>
            {rows.length === 1 ? "1 event recorded" : `${rows.length} events recorded`}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="na" style={{ padding: "18px 24px", margin: 0 }}>
            No audit events recorded yet. The log fills as admins promote, ingest and unblock.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>At (UTC)</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{utc(r.at)}</td>
                  <td>{r.actor}</td>
                  <td>
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--color-neutral-700)",
                      }}
                    >
                      {r.role}
                    </span>
                  </td>
                  <td>{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
