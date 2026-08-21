import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { auditEvent } from "@/db/schema";
import { VELUMA_EVENTS_AUDIT_ACTION } from "@/lib/ingest/veluma-events";

const ackCountsSchema = z.object({
  applied: z.number(),
  merged: z.number(),
  skipped: z.number(),
});

const deliverySummarySchema = z.object({
  ingestRunId: z.string(),
  contractVersion: z.string().optional(),
  recordCount: z.number().optional(),
  applied: z.number(),
  merged: z.number(),
  skipped: z.number(),
  byType: z.record(z.string(), ackCountsSchema).default({}),
});

export default async function VelumaPage() {
  const user = await requireUser();
  const env = serverEnv();
  const configured = Boolean(env.VELUMA_BASE_URL && env.VELUMA_API_KEY);
  const pushConfigured = Boolean(env.VELUMA_WEBHOOK_SECRET);

  const db = await getDb();
  const lastAudit = (
    await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.action, VELUMA_EVENTS_AUDIT_ACTION))
      .orderBy(desc(auditEvent.at))
      .limit(1)
  )[0];
  const lastDelivery = lastAudit ? deliverySummarySchema.safeParse(lastAudit.afterJson) : null;

  return (
    <>
      <h1>Veluma transport</h1>
      <p className="lede">
        Day-one transport is file-drop of the same envelope Book4Time will automate into Veluma. Live pull/webhook is
        config, not code. Secrets are server-env only and are never rendered back.
      </p>
      <div className="card">
        <p>Base URL set: {env.VELUMA_BASE_URL ? "yes" : "no"}</p>
        <p>API key set: {env.VELUMA_API_KEY ? "yes (write-only)" : "no"}</p>
        <p>Webhook secret set: {env.VELUMA_WEBHOOK_SECRET ? "yes (write-only)" : "no"}</p>
        <p>Poll interval: {env.VELUMA_POLL_INTERVAL ?? "not set"}</p>
        <p>Mode: {configured ? "live-capable" : "file-drop"}</p>
      </div>

      {/* ---- Live event push status (Veluma -> Sporacle) ---- */}
      <section className="card" data-veluma-events-status="true">
        <h2>Live event push</h2>
        <p>
          Endpoint: <code>POST /api/integrations/veluma/events</code> —{" "}
          {pushConfigured ? (
            <span className="ok">configured (webhook secret set)</span>
          ) : (
            <span className="fail">not configured — VELUMA_WEBHOOK_SECRET is unset, deliveries are refused (fail-closed 401)</span>
          )}
        </p>
        {lastDelivery?.success ? (
          <>
            <p>
              Last delivery received: {lastAudit?.at.toISOString()} (UTC) — ingest run{" "}
              <code>{lastDelivery.data.ingestRunId}</code>
            </p>
            <p>
              Ack: applied {lastDelivery.data.applied}, merged {lastDelivery.data.merged}, skipped{" "}
              {lastDelivery.data.skipped}
              {typeof lastDelivery.data.recordCount === "number" ? ` (of ${lastDelivery.data.recordCount} records)` : null}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Event type</th>
                  <th>Applied</th>
                  <th>Merged</th>
                  <th>Skipped</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lastDelivery.data.byType).map(([type, counts]) => (
                  <tr key={type}>
                    <td>{type}</td>
                    <td>{counts.applied}</td>
                    <td>{counts.merged}</td>
                    <td>{counts.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="meta">No live event deliveries received yet.</p>
        )}
        <p className="notice">
          profile.upsert events are acknowledged but skipped by design: guest profile data is never stored, logged, or
          kept beyond the request (I1 — no guest PII). Only PII-free operational fields from spa.booking.created and
          outlet.reservation.upsert are persisted, each carrying its ingest run for provenance (I4).
        </p>
      </section>

      {can(user, "change_config") ? (
        <p className="meta">Set VELUMA_* in server env. There is no client field for secrets (I13).</p>
      ) : (
        <p className="meta">Only admin can change transport config, via server environment.</p>
      )}
    </>
  );
}
