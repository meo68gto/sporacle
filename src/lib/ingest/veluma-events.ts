import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/db/client";
import { newId } from "@/db/ids";
import { auditEvent, feedAdapter, ingestRun, velumaEvent } from "@/db/schema";
import { fromCents } from "@/lib/money";
import { verifyVelumaHmac } from "./hmac";

/**
 * Live Veluma -> Sporacle event ingest (contract hospitality.v1, target_kind=sporacle).
 *
 * I1  — profile.upsert is NEVER stored, logged, or kept beyond the request:
 *       it is acked as "skipped" and its payload is never read at all.
 * I12 — records are taken verbatim; Sporacle does not reconcile or merge them.
 * I13 — the HMAC secret is the credential. Header/body identity fields
 *       (X-Veluma-Tenant-Id and friends) are ignored: Sporacle is single-tenant
 *       and never selects identity from a client-suppliable header.
 * I3  — the veluma_event table is an append-only event log of claims made by
 *       the feed; rows are never merged in place.
 */

export const VELUMA_EVENTS_FEED_KEY = "veluma_events";
export const VELUMA_EVENTS_TRANSPORT = "veluma_events";
export const VELUMA_EVENTS_AUDIT_ACTION = "veluma_events_delivery";
export const VELUMA_EVENTS_SOURCE_ID = "src_veluma_events";
export const SUPPORTED_CONTRACT_MAJOR = 1;

export const PROFILE_EVENT_TYPE = "profile.upsert";
export const STORED_EVENT_TYPES = ["spa.booking.created", "outlet.reservation.upsert"] as const;

/**
 * I1 — field names that must never be persisted, whatever shape a payload takes.
 * Mirrors the contract spec §4.1/§4.2 PII list. The keep-allowlist below never
 * reads any of these; this list exists as a belt-and-braces runtime assert and
 * for the invariant test.
 */
export const VELUMA_PII_FIELD_NAMES = [
  "name",
  "fullName",
  "firstName",
  "lastName",
  "guestName",
  "displayName",
  "email",
  "phone",
  "address",
  "street",
  "city",
  "postalCode",
  "zip",
  "card",
  "cardNumber",
  "pan",
  "cvv",
  "payment",
  "customer_id",
  "customerId",
  "customer_code",
  "customerCode",
  "loyaltyId",
  "loyalty_id",
  "externalId",
  "external_id",
  "roomNumber",
  "room_number",
  "room",
  "notes",
  "comments",
  "comment",
  "note",
  "profile",
  "vipTier",
  "market_segment",
  "marketSegment",
  "country",
  "language",
] as const;

const PII_KEYS_LOWER = new Set(VELUMA_PII_FIELD_NAMES.map((k) => k.toLowerCase()));

/** Throws if any key of an object about to be persisted is a PII field name (I1). */
export function assertNoPiiKeys(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (PII_KEYS_LOWER.has(key.toLowerCase())) {
      throw new Error(`I1: refusing to persist PII-named field "${key}"`);
    }
  }
}

/* ---------- Zod schemas (all .strip(): unknown fields are dropped) ---------- */

const lineageSchema = z
  .object({
    connector: z.string().nullish().catch(null),
    run_id: z.string().nullish().catch(null),
  })
  .strip();

const recordEnvelopeSchema = z
  .object({
    schema_version: z.string().nullish().catch(null),
    property_id: z.string().nullish().catch(null),
    source_lineage: lineageSchema.nullish().catch(null),
  })
  .strip();

/**
 * Keep-allowlist for spa.booking.created / outlet.reservation.upsert payloads.
 * The payload shape is not yet pinned upstream, so this is default-deny:
 * only these operationally-safe keys survive; everything else — including any
 * PII field the contract spec names — is stripped before anything is stored.
 * Every field is tolerant (`catch`) so a malformed value degrades to null (I5),
 * never to a rejected batch.
 */
const operationalPayloadSchema = z
  .object({
    booking_id: z.string().nullish().catch(null),
    bookingId: z.string().nullish().catch(null),
    reservation_id: z.string().nullish().catch(null),
    reservationId: z.string().nullish().catch(null),
    service_code: z.string().nullish().catch(null),
    serviceCode: z.string().nullish().catch(null),
    outlet_code: z.string().nullish().catch(null),
    outletCode: z.string().nullish().catch(null),
    start_at: z.string().nullish().catch(null),
    startAt: z.string().nullish().catch(null),
    start_time: z.string().nullish().catch(null),
    end_at: z.string().nullish().catch(null),
    endAt: z.string().nullish().catch(null),
    end_time: z.string().nullish().catch(null),
    business_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish()
      .catch(null),
    businessDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish()
      .catch(null),
    status: z.string().nullish().catch(null),
    party_size: z.number().int().nullish().catch(null),
    partySize: z.number().int().nullish().catch(null),
    covers: z.number().int().nullish().catch(null),
    value_cents: z.number().int().nullish().catch(null),
    valueCents: z.number().int().nullish().catch(null),
    channel: z.string().nullish().catch(null),
    booking_channel: z.string().nullish().catch(null),
    technician_ref: z.string().nullish().catch(null),
    technicianRef: z.string().nullish().catch(null),
  })
  .strip();

const recordSchema = z
  .object({
    eventType: z.string().min(1),
    canonical_type: z.string().nullish().catch(null),
    idempotency_key: z.string().min(1),
    source_ref: z.string().nullish().catch(null),
    payload: z.record(z.string(), z.unknown()).nullish().catch(null),
    envelope: recordEnvelopeSchema.nullish().catch(null),
  })
  .strip();

const batchSchema = z
  .object({
    source: z.string().nullish().catch(null),
    contractVersion: z.string().min(1),
    records: z.array(z.unknown()).default([]),
    records_skipped_by_policy: z.number().int().nullish().catch(null),
  })
  .strip();

/** Mirrors Veluma's parse_contract_major: regex v(\d+); unsupported major -> reject. */
export function parseContractMajor(version: string): number | null {
  const m = /v(\d+)/.exec(version);
  if (!m || m[1] === undefined) return null;
  return Number(m[1]);
}

/* ---------- processing ---------- */

export type VelumaEventsAck = { applied: number; merged: number; skipped: number };
export type PerTypeCounts = Record<string, VelumaEventsAck>;

export type VelumaEventsResult =
  | { ok: true; ingestRunId: string; ack: VelumaEventsAck; byType: PerTypeCounts; redelivery: boolean }
  | { ok: false; status: 400; error: string };

function bump(byType: PerTypeCounts, type: string, key: keyof VelumaEventsAck): void {
  const entry = byType[type] ?? { applied: 0, merged: 0, skipped: 0 };
  entry[key] += 1;
  byType[type] = entry;
}

function firstString(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function firstInt(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (typeof v === "number" && Number.isInteger(v)) return v;
  return null;
}

function toTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function processVelumaEventsBatch(
  db: Db,
  rawBatch: unknown,
  opts: { batchKey?: string | null; payloadSha256?: string | null; sentAt?: Date | null } = {},
): Promise<VelumaEventsResult> {
  const parsed = batchSchema.safeParse(rawBatch);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "invalid_batch_envelope" };
  }
  const batch = parsed.data;
  const major = parseContractMajor(batch.contractVersion);
  if (major !== SUPPORTED_CONTRACT_MAJOR) {
    return { ok: false, status: 400, error: `unsupported_contract_version:${batch.contractVersion}` };
  }

  const now = new Date();
  const batchKey = opts.batchKey?.trim() || null;

  // Batch-level idempotency: a redelivered batch (same X-Veluma-Idempotency-Key)
  // was already fully processed — ack everything as skipped without reprocessing.
  if (batchKey) {
    const prior = await db.select().from(ingestRun).where(eq(ingestRun.deliveryId, batchKey));
    const done = prior.find((r) => r.status === "success");
    if (done) {
      const runId = newId("run");
      const skippedAll = batch.records.length;
      await db.insert(ingestRun).values({
        id: runId,
        sourceId: VELUMA_EVENTS_SOURCE_ID,
        transport: VELUMA_EVENTS_TRANSPORT,
        deliveryId: null,
        feedKey: VELUMA_EVENTS_FEED_KEY,
        payloadSha256: opts.payloadSha256 ?? null,
        originPulledAt: opts.sentAt ?? null,
        deliveredAt: now,
        rowCount: 0,
        status: "noop",
        error: `redelivery of ${batchKey}`,
        createdAt: now,
      });
      await db.insert(auditEvent).values({
        id: newId("aud"),
        actor: "veluma-webhook",
        role: "system",
        action: VELUMA_EVENTS_AUDIT_ACTION,
        beforeJson: null,
        afterJson: {
          ingestRunId: runId,
          contractVersion: batch.contractVersion,
          recordCount: skippedAll,
          applied: 0,
          merged: 0,
          skipped: skippedAll,
          byType: { redelivery: { applied: 0, merged: 0, skipped: skippedAll } },
        },
        at: now,
      });
      return {
        ok: true,
        ingestRunId: runId,
        ack: { applied: 0, merged: 0, skipped: skippedAll },
        byType: { redelivery: { applied: 0, merged: 0, skipped: skippedAll } },
        redelivery: true,
      };
    }
  }

  const runId = newId("run");
  // Status starts as "received" and is flipped to "success" only after every
  // record is processed. If processing crashes mid-batch, the run never reads
  // "success", so Veluma's retry with the same idempotency key is reprocessed
  // (record-level dedupe prevents duplicates) instead of being skipped — a
  // half-stored batch must never present as a successful delivery.
  await db.insert(ingestRun).values({
    id: runId,
    sourceId: VELUMA_EVENTS_SOURCE_ID,
    transport: VELUMA_EVENTS_TRANSPORT,
    deliveryId: batchKey,
    feedKey: VELUMA_EVENTS_FEED_KEY,
    payloadSha256: opts.payloadSha256 ?? null,
    originPulledAt: opts.sentAt ?? null,
    deliveredAt: now,
    rowCount: 0,
    status: "received",
    error: null,
    createdAt: now,
  });

  const ack: VelumaEventsAck = { applied: 0, merged: 0, skipped: 0 };
  const byType: PerTypeCounts = {};

  for (const rawRecord of batch.records) {
    const rec = recordSchema.safeParse(rawRecord);
    if (!rec.success) {
      ack.skipped += 1;
      bump(byType, "invalid_record", "skipped");
      continue;
    }
    const record = rec.data;
    const eventType = record.eventType;

    // I1: guest profile events are acknowledged and dropped. The payload is
    // never read, never stored, never logged — skipped by design.
    if (eventType === PROFILE_EVENT_TYPE) {
      ack.skipped += 1;
      bump(byType, eventType, "skipped");
      continue;
    }

    if (!(STORED_EVENT_TYPES as readonly string[]).includes(eventType)) {
      ack.skipped += 1;
      bump(byType, eventType, "skipped");
      continue;
    }

    // Record-level idempotency (contract §6 dedupe key).
    const existing = await db
      .select({ id: velumaEvent.id })
      .from(velumaEvent)
      .where(eq(velumaEvent.idempotencyKey, record.idempotency_key));
    if (existing.length > 0) {
      ack.skipped += 1;
      bump(byType, eventType, "skipped");
      continue;
    }

    // Keep-allowlist extraction (default-deny; unknown fields already stripped).
    const p = operationalPayloadSchema.parse(record.payload ?? {});
    // I6: date basis is explicit and fixed per event type.
    const dateBasis = eventType === "spa.booking.created" ? "booking_date" : "service_date";
    const cents = firstInt(p.value_cents, p.valueCents);

    const row = {
      id: newId("vev"),
      ingestRunId: runId,
      eventType,
      canonicalType: record.canonical_type ?? null,
      idempotencyKey: record.idempotency_key,
      sourceRef: record.source_ref ?? null,
      schemaVersion: record.envelope?.schema_version ?? null,
      propertyRef: record.envelope?.property_id ?? null,
      lineageConnector: record.envelope?.source_lineage?.connector ?? null,
      lineageRunId: record.envelope?.source_lineage?.run_id ?? null,
      bookingRef: firstString(p.booking_id, p.bookingId, p.reservation_id, p.reservationId),
      serviceCode: firstString(p.service_code, p.serviceCode),
      outletCode: firstString(p.outlet_code, p.outletCode),
      startAt: toTimestamp(firstString(p.start_at, p.startAt, p.start_time)),
      endAt: toTimestamp(firstString(p.end_at, p.endAt, p.end_time)),
      businessDate: firstString(p.business_date, p.businessDate),
      dateBasis,
      status: p.status ?? null,
      partySize: firstInt(p.party_size, p.partySize, p.covers),
      // Money is integer cents; non-integer input already degraded to null above.
      valueCents: cents === null ? null : fromCents(cents).cents,
      channel: firstString(p.channel, p.booking_channel),
      technicianRef: firstString(p.technician_ref, p.technicianRef),
      receivedAt: now,
    };
    assertNoPiiKeys(row); // I1 belt-and-braces
    await db.insert(velumaEvent).values(row);
    ack.applied += 1;
    bump(byType, eventType, "applied");
  }

  await db
    .update(ingestRun)
    .set({ rowCount: ack.applied, status: "success" })
    .where(eq(ingestRun.id, runId));

  await db
    .insert(feedAdapter)
    .values({ feedKey: VELUMA_EVENTS_FEED_KEY, status: "configured", lastDeliveryAt: now })
    .onConflictDoUpdate({
      target: feedAdapter.feedKey,
      set: { status: "configured", lastDeliveryAt: now },
    });

  // I4 audit trail: counts and ids only — never event content.
  await db.insert(auditEvent).values({
    id: newId("aud"),
    actor: "veluma-webhook",
    role: "system",
    action: VELUMA_EVENTS_AUDIT_ACTION,
    beforeJson: null,
    afterJson: {
      ingestRunId: runId,
      contractVersion: batch.contractVersion,
      recordCount: batch.records.length,
      applied: ack.applied,
      merged: ack.merged,
      skipped: ack.skipped,
      byType,
    },
    at: now,
  });

  return { ok: true, ingestRunId: runId, ack, byType, redelivery: false };
}

/* ---------- HTTP handler (route stays a thin wrapper) ---------- */

export type VelumaEventsHttpResult = { status: number; body: Record<string, unknown> };

export async function handleVelumaEventsRequest(
  db: Db,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string | undefined,
): Promise<VelumaEventsHttpResult> {
  // Fail-closed (contract requirement): no secret configured -> 401, always.
  const trimmed = secret?.trim();
  if (!trimmed) {
    return { status: 401, body: { error: "VELUMA_WEBHOOK_SECRET is not configured" } };
  }
  const auth = verifyVelumaHmac(headers, rawBody, trimmed);
  if (!auth.ok) {
    return { status: 401, body: { error: "invalid signature", reason: auth.reason } };
  }

  let parsedBody: unknown;
  try {
    parsedBody = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
  } catch {
    return { status: 400, body: { error: "invalid json" } };
  }

  const batchKeyRaw = headers["x-veluma-idempotency-key"];
  const batchKey = Array.isArray(batchKeyRaw) ? batchKeyRaw[0] : batchKeyRaw;
  const tsRaw = headers["x-veluma-timestamp"];
  const ts = Array.isArray(tsRaw) ? tsRaw[0] : tsRaw;
  const sentAt = ts && Number.isFinite(Number(ts)) ? new Date(Number(ts) * 1000) : null;

  const result = await processVelumaEventsBatch(db, parsedBody, {
    batchKey: batchKey ?? null,
    payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
    sentAt,
  });

  if (!result.ok) {
    return { status: result.status, body: { error: result.error } };
  }
  // Ack shape Veluma parses: `id` becomes target_ref, `ack` lands on lineage.
  return {
    status: 200,
    body: {
      id: result.ingestRunId,
      ack: { applied: result.ack.applied, merged: result.ack.merged, skipped: result.ack.skipped },
    },
  };
}
