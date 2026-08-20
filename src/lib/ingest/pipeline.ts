import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Db } from "@/db/client";
import { newId } from "@/db/ids";
import {
  collisionLog,
  feedAdapter,
  ingestRun,
  measureFact,
  quarantine,
  source,
  technicianPseudonym,
} from "@/db/schema";
import { SOURCE_SEED, seedSources } from "@/db/sources";
import { EXTRA_FEED_KEYS, parseEnvelope, sourceForFeed } from "./envelope";
import { parseEnvelopeFacts } from "./parsers";

export type Transport = "veluma_pull" | "veluma_push" | "file_drop";

export type IngestResult = {
  ingestRunId: string;
  status: string;
  stored: number;
  reason?: string;
};

async function ensureSeeded(db: Db): Promise<void> {
  const rows = await db.select({ id: source.id }).from(source);
  if (rows.length === 0) await seedSources(db);
}

export async function ingestEnvelope(
  db: Db,
  raw: unknown,
  transport: Transport,
  fileLabel?: string,
): Promise<IngestResult> {
  await ensureSeeded(db);
  const parsed = parseEnvelope(raw);
  const now = new Date();

  if (!parsed.ok) {
    const runId = newId("run");
    const src = parsed.envelope ? sourceForFeed(parsed.envelope.feed_key) : null;
    await db.insert(ingestRun).values({
      id: runId,
      sourceId: src?.id ?? "unknown",
      transport,
      deliveryId: null,
      feedKey: parsed.envelope?.feed_key ?? null,
      payloadSha256: parsed.envelope?.payload_sha256 ?? null,
      fileLabel: fileLabel ?? null,
      originPulledAt: parsed.envelope ? new Date(parsed.envelope.origin.pulled_at) : null,
      deliveredAt: parsed.envelope ? new Date(parsed.envelope.delivered_at) : now,
      businessDateFrom: parsed.envelope?.origin.business_date_from ?? null,
      businessDateTo: parsed.envelope?.origin.business_date_to ?? null,
      rowCount: 0,
      status: "quarantined",
      error: parsed.reason,
      createdAt: now,
    });
    await db.insert(quarantine).values({
      id: newId("q"),
      ingestRunId: runId,
      reason: parsed.reason,
      rawPayload: raw as object,
      quarantinedAt: now,
    });
    return { ingestRunId: runId, status: "quarantined", stored: 0, reason: parsed.reason };
  }

  const envelope = parsed.envelope;
  const srcMeta = sourceForFeed(envelope.feed_key);

  const priorSameId = await db
    .select()
    .from(ingestRun)
    .where(eq(ingestRun.deliveryId, envelope.delivery_id));
  const applied = priorSameId.find((r) => r.status === "success" || r.status === "blocked");
  if (applied) {
    const runId = newId("run");
    await db.insert(ingestRun).values({
      id: runId,
      sourceId: applied.sourceId,
      transport,
      deliveryId: null,
      feedKey: envelope.feed_key,
      payloadSha256: envelope.payload_sha256,
      fileLabel: fileLabel ?? null,
      originPulledAt: new Date(envelope.origin.pulled_at),
      deliveredAt: new Date(envelope.delivered_at),
      businessDateFrom: envelope.origin.business_date_from,
      businessDateTo: envelope.origin.business_date_to,
      rowCount: 0,
      status: "noop",
      error: `redelivery of ${envelope.delivery_id}`,
      createdAt: now,
    });
    return { ingestRunId: runId, status: "noop", stored: 0 };
  }

  if (envelope.status === "blocked") {
    const runId = newId("run");
    await db.insert(ingestRun).values({
      id: runId,
      sourceId: srcMeta?.id ?? "src_d7",
      transport,
      deliveryId: envelope.delivery_id,
      feedKey: envelope.feed_key,
      payloadSha256: envelope.payload_sha256,
      fileLabel: fileLabel ?? null,
      originPulledAt: new Date(envelope.origin.pulled_at),
      deliveredAt: new Date(envelope.delivered_at),
      businessDateFrom: envelope.origin.business_date_from,
      businessDateTo: envelope.origin.business_date_to,
      rowCount: 0,
      status: "blocked",
      error: envelope.blocked_reason,
      createdAt: now,
    });
    return { ingestRunId: runId, status: "blocked", stored: 0, reason: envelope.blocked_reason ?? undefined };
  }

  const sourceId = srcMeta?.id ?? `src_${envelope.feed_key}`;
  if (!srcMeta && EXTRA_FEED_KEYS.has(envelope.feed_key)) {
    await db
      .insert(source)
      .values({
        id: sourceId,
        reportCode: envelope.origin.report_code,
        key: envelope.feed_key,
        label: envelope.origin.report_name,
        grain: "external",
        dateBasis: envelope.origin.date_basis,
        status: "active",
      })
      .onConflictDoNothing();
  }

  const priorSameOrigin = await db
    .select()
    .from(ingestRun)
    .where(and(eq(ingestRun.feedKey, envelope.feed_key), eq(ingestRun.status, "success")));
  const originKey = `${envelope.origin.report_code}|${envelope.origin.business_date_from}|${envelope.origin.business_date_to}`;
  const match = priorSameOrigin.find((r) => {
    const key = `${srcMeta?.reportCode ?? envelope.origin.report_code}|${r.businessDateFrom}|${r.businessDateTo}`;
    return key === originKey && r.payloadSha256 && r.payloadSha256 !== envelope.payload_sha256;
  });

  const runId = newId("run");
  await db.insert(ingestRun).values({
    id: runId,
    sourceId,
    transport,
    deliveryId: envelope.delivery_id,
    feedKey: envelope.feed_key,
    payloadSha256: envelope.payload_sha256,
    fileLabel: fileLabel ?? null,
    originPulledAt: new Date(envelope.origin.pulled_at),
    deliveredAt: new Date(envelope.delivered_at),
    businessDateFrom: envelope.origin.business_date_from,
    businessDateTo: envelope.origin.business_date_to,
    rowCount: 0,
    status: "success",
    error: null,
    supersedesRunId: match?.id ?? null,
    createdAt: now,
  });

  if (match) {
    await db.update(measureFact).set({ retired: true }).where(eq(measureFact.ingestRunId, match.id));
  }

  const facts = parseEnvelopeFacts(envelope);
  if (envelope.feed_key === "b4t_hours_work_summary") {
    const techRows = facts.filter((f) => f.dimensionType === "technician");
    if (techRows.length > 0) {
      throw new Error("I3: D8 must not invent technician rows");
    }
  }

  let stored = 0;
  for (const fact of facts) {
    if (fact.dimensionType === "technician" && fact.dimensionValue) {
      await upsertPseudonym(db, fact.dimensionValue, fact.businessDate);
    }
    const existing = await db
      .select()
      .from(measureFact)
      .where(
        and(
          eq(measureFact.sourceId, sourceId),
          eq(measureFact.measureKey, fact.measureKey),
          eq(measureFact.businessDate, fact.businessDate),
          eq(measureFact.dimensionType, fact.dimensionType),
          eq(measureFact.retired, false),
        ),
      );
    const collision = existing.find(
      (row) => (row.dimensionValue ?? "") === (fact.dimensionValue ?? "") && row.ingestRunId !== runId,
    );
    if (collision) {
      const priorRun = (await db.select().from(ingestRun).where(eq(ingestRun.id, collision.ingestRunId)))[0];
      const priorPulled = priorRun?.originPulledAt?.getTime() ?? 0;
      const newPulled = new Date(envelope.origin.pulled_at).getTime();
      if (newPulled >= priorPulled) {
        await db.update(measureFact).set({ retired: true }).where(eq(measureFact.id, collision.id));
        await db.insert(collisionLog).values({
          id: newId("col"),
          sourceId,
          measureKey: fact.measureKey,
          businessDate: fact.businessDate,
          dimensionType: fact.dimensionType,
          dimensionValue: fact.dimensionValue,
          keptRunId: runId,
          droppedRunId: collision.ingestRunId,
          loggedAt: now,
        });
      } else {
        await db.insert(collisionLog).values({
          id: newId("col"),
          sourceId,
          measureKey: fact.measureKey,
          businessDate: fact.businessDate,
          dimensionType: fact.dimensionType,
          dimensionValue: fact.dimensionValue,
          keptRunId: collision.ingestRunId,
          droppedRunId: runId,
          loggedAt: now,
        });
        continue;
      }
    }
    await db.insert(measureFact).values({
      id: newId("fact"),
      ingestRunId: runId,
      sourceId,
      measureKey: fact.measureKey,
      businessDate: fact.businessDate,
      dimensionType: fact.dimensionType,
      dimensionValue: fact.dimensionValue,
      valueNumeric: fact.valueNumeric,
      unit: fact.unit,
      isTotalRow: fact.isTotalRow,
      retired: false,
    });
    stored += 1;
  }

  await db.update(ingestRun).set({ rowCount: stored }).where(eq(ingestRun.id, runId));
  await db
    .insert(feedAdapter)
    .values({
      feedKey: envelope.feed_key,
      status: "configured",
      lastDeliveryAt: new Date(envelope.delivered_at),
    })
    .onConflictDoUpdate({
      target: feedAdapter.feedKey,
      set: { status: "configured", lastDeliveryAt: new Date(envelope.delivered_at) },
    });
  return { ingestRunId: runId, status: "success", stored };
}

async function upsertPseudonym(db: Db, pseudonym: string, businessDate: string): Promise<void> {
  const hash = createHash("sha256").update(pseudonym).digest("hex");
  const existing = await db.select().from(technicianPseudonym).where(eq(technicianPseudonym.pseudonym, pseudonym));
  const row = existing[0];
  if (!row) {
    await db.insert(technicianPseudonym).values({
      pseudonym,
      sourceIdentifierHash: hash,
      firstSeen: businessDate,
      lastSeen: businessDate,
    });
    return;
  }
  await db
    .update(technicianPseudonym)
    .set({ lastSeen: businessDate })
    .where(eq(technicianPseudonym.pseudonym, pseudonym));
}

export function knownSourceKeys(): string[] {
  return SOURCE_SEED.map((s) => s.key);
}
