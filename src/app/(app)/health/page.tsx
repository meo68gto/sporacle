import { getDb } from "@/lib/runtime";
import { ingestRun, quarantine, source } from "@/db/schema";
import { desc } from "drizzle-orm";

export default async function HealthPage() {
  const db = await getDb();
  const sources = await db.select().from(source);
  const runs = await db.select().from(ingestRun).orderBy(desc(ingestRun.createdAt));
  const qs = await db.select().from(quarantine);
  return (
    <>
      <h1>Data health</h1>
      <p className="lede">Per-source status. A blocked delivery is source trouble. No delivery at all is transport trouble.</p>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th>Last run</th>
            <th>Quarantine</th>
            <th>Blocked</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const last = runs.find((r) => r.sourceId === s.id);
            const qCount = qs.filter((q) => q.ingestRunId && runs.find((r) => r.id === q.ingestRunId && r.sourceId === s.id)).length;
            return (
              <tr key={s.id} className={s.status === "blocked" ? "fail" : ""}>
                <td>
                  {s.key} {s.reportCode ?? ""} {s.label}
                </td>
                <td>{s.status}</td>
                <td>{last ? `${last.status} ${last.createdAt.toISOString()}` : "no delivery — transport/staleness"}</td>
                <td>{qCount}</td>
                <td>
                  {s.key === "D7" || s.status === "blocked"
                    ? `${s.blockedReason ?? ""} since ${s.blockedSince ?? ""}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}