import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { auditEvent, ingestRun, velumaEvent } from "@/db/schema";
import {
  classifyEventType,
  VELUMA_EVENTS_AUDIT_ACTION,
  VELUMA_EVENTS_FEED_KEY,
  VELUMA_EVENTS_SOURCE_ID,
} from "@/lib/ingest/veluma-events";

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
  skippedReasons: z.record(z.string(), z.number()).optional(),
});

/** I4 — inline provenance line for a veluma-events figure. */
function EventProvenance(props: { deliveryId: string | null; ingestRunId: string; receivedAt: string }) {
  return (
    <span className="meta" data-provenance="true">
      source {VELUMA_EVENTS_SOURCE_ID} · delivery {props.deliveryId ?? "none"} · ingest run{" "}
      <code>{props.ingestRunId}</code> · received {props.receivedAt}
    </span>
  );
}

export default async function VelumaPage() {
  const user = await requireUser();
  const env = serverEnv();
  const configured = Boolean(env.VELUMA_BASE_URL && env.VELUMA_API_KEY);
  const pushConfigured = Boolean(env.VELUMA_WEBHOOK_SECRET);

  const db = await getDb();

  // ---- Read surface (I3): veluma_event is read here, not write-only. ----
  // Last completed delivery (only "success" runs — a received/failed run is not
  // a delivery, and delivery_id is stamped only at terminal success, B2).
  const lastRun = (
    await db
      .select()
      .from(ingestRun)
      .where(and(eq(ingestRun.feedKey, VELUMA_EVENTS_FEED_KEY), eq(ingestRun.status, "success")))
      .orderBy(desc(ingestRun.deliveredAt))
      .limit(1)
  )[0];

  // Stored events, counted by stored kind via the same classifier the ingest uses.
  const events = await db
    .select({
      eventType: velumaEvent.eventType,
      canonicalType: velumaEvent.canonicalType,
      ingestRunId: velumaEvent.ingestRunId,
      receivedAt: velumaEvent.receivedAt,
    })
    .from(velumaEvent);
  const kindCounts = new Map<string, number>();
  for (const e of events) {
    const kind = classifyEventType(e.eventType, e.canonicalType);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }
  const lastReceived = events
    .map((e) => e.receivedAt)
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1);

  // Ack totals across every delivery — derived from the audit trail the ingest
  // writes (counts and ids only; never event content).
  const audits = await db
    .select()
    .from(auditEvent)
    .where(eq(auditEvent.action, VELUMA_EVENTS_AUDIT_ACTION))
    .orderBy(desc(auditEvent.at));
  const parsedAudits = audits.flatMap((a) => {
    const parsed = deliverySummarySchema.safeParse(a.afterJson);
    return parsed.success ? [{ at: a.at, data: parsed.data }] : [];
  });
  const totals = parsedAudits.reduce(
    (acc, a) => ({
      applied: acc.applied + a.data.applied,
      merged: acc.merged + a.data.merged,
      skipped: acc.skipped + a.data.skipped,
    }),
    { applied: 0, merged: 0, skipped: 0 },
  );
  const lastAudit = parsedAudits[0];

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
        <p>
          Property pin: <code>{env.VELUMA_PROPERTY_ID}</code> (server env — mismatching records are skipped and audited)
        </p>
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
            <span className="fail">
              not configured — VELUMA_WEBHOOK_SECRET is unset, deliveries are refused (fail-closed 401)
            </span>
          )}
        </p>

        {lastRun ? (
          <>
            <p>
              Last delivery received: {lastRun.deliveredAt?.toISOString() ?? "unknown"} (UTC) — {lastRun.rowCount}{" "}
              record{lastRun.rowCount === 1 ? "" : "s"} stored
            </p>
            <EventProvenance
              deliveryId={lastRun.deliveryId}
              ingestRunId={lastRun.id}
              receivedAt={lastRun.deliveredAt?.toISOString() ?? "unknown"}
            />
          </>
        ) : (
          // I5 — an explicit empty state, not a blank: no delivery has completed.
          <p className="meta" data-empty-state="true">
            No deliveries received yet — no completed ingest run exists for feed{" "}
            <code>{VELUMA_EVENTS_FEED_KEY}</code>.
          </p>
        )}

        <h3>Stored events by kind</h3>
        {events.length > 0 ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>Stored kind</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {[...kindCounts.entries()].map(([kind, count]) => (
                  <tr key={kind}>
                    <td>{kind}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EventProvenance
              deliveryId={lastRun?.deliveryId ?? null}
              ingestRunId={lastRun?.id ?? events[events.length - 1]?.ingestRunId ?? "unknown"}
              receivedAt={lastReceived?.toISOString() ?? "unknown"}
            />
          </>
        ) : (
          <p className="meta" data-empty-state="true">
            No events stored yet. This is a real state, not zero: the feed has delivered nothing storable (I5).
          </p>
        )}

        <h3>Acknowledgement totals</h3>
        {parsedAudits.length > 0 ? (
          <>
            <p>
              Across {parsedAudits.length} deliver{parsedAudits.length === 1 ? "y" : "ies"}: applied {totals.applied},
              merged {totals.merged}, skipped {totals.skipped}. Skips are policy (guest profiles declined by design,
              unknown types, duplicates, property mismatches, malformed records) — recorded per reason in the audit
              trail.
            </p>
            {lastAudit ? (
              <>
                <p className="meta">Latest delivery ack ({lastAudit.at.toISOString()} UTC):</p>
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
                    {Object.entries(lastAudit.data.byType).map(([type, counts]) => (
                      <tr key={type}>
                        <td>{type}</td>
                        <td>{counts.applied}</td>
                        <td>{counts.merged}</td>
                        <td>{counts.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lastAudit.data.skippedReasons && Object.keys(lastAudit.data.skippedReasons).length > 0 ? (
                  <p className="meta">
                    Skip reasons:{" "}
                    {Object.entries(lastAudit.data.skippedReasons)
                      .map(([reason, n]) => `${reason} ×${n}`)
                      .join(", ")}
                  </p>
                ) : null}
                <EventProvenance
                  deliveryId={lastRun?.deliveryId ?? null}
                  ingestRunId={lastAudit.data.ingestRunId}
                  receivedAt={lastAudit.at.toISOString()}
                />
              </>
            ) : null}
          </>
        ) : (
          <p className="meta" data-empty-state="true">
            No acknowledgements recorded yet — nothing has been delivered to acknowledge.
          </p>
        )}

        <p className="notice">
          Guest profile events (profile.upsert / canonical type customer) are acknowledged but skipped by design and
          are never parsed, stored, or logged (I1 — no guest PII). Only PII-free operational fields from the
          spa_booking and outlet_reservation families are persisted, each carrying its ingest run for provenance (I4).
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
