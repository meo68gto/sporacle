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
 * I1  — guest-profile events are NEVER stored, logged, or kept beyond the request:
 *       classification happens on a slim schema (eventType/canonical_type/
 *       idempotency_key only) so a profile payload is never even structurally
 *       parsed. Persisted string fields are additionally value-hardened
 *       (pseudonym pattern for technician_ref; opaque-token rules for refs).
 * I12 — records are taken verbatim; Sporacle does not reconcile or merge them.
 * I13 — the HMAC secret is the credential. Header/body identity fields
 *       (X-Veluma-Tenant-Id and friends) are ignored: Sporacle is single-tenant
 *       and never selects identity from a client-suppliable header. The expected
 *       property id is pinned in server env (VELUMA_PROPERTY_ID), never taken
 *       from the request.
 * I3  — the veluma_event table is an append-only event log of claims made by
 *       the feed; rows are never merged in place.
 * I4  — a stored record must carry its primary business identifier; an all-null
 *       husk is skipped as malformed, never inserted.
 */

export const VELUMA_EVENTS_FEED_KEY = "veluma_events";
export const VELUMA_EVENTS_TRANSPORT = "veluma_events";
export const VELUMA_EVENTS_AUDIT_ACTION = "veluma_events_delivery";
export const VELUMA_EVENTS_SOURCE_ID = "src_veluma_events";
export const SUPPORTED_CONTRACT_MAJOR = 1;

export const PROFILE_EVENT_TYPE = "profile.upsert";
export const PROFILE_CANONICAL_TYPE = "customer";

/**
 * Request-size guards (I2 finding): a delivery bigger than either cap is
 * rejected with 413 BEFORE signature verification / record processing.
 * Why 413 and not a 200 all-skipped ack: Veluma marks a 2xx-acked batch
 * `delivered` — its records would be silently dropped forever. A 413 is a
 * non-2xx failure, so Veluma retries with backoff and then dead-letters with
 * the reason string preserved, keeping every record replayable by an operator.
 * Visible failure over silent data loss (I5 spirit).
 */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_RECORDS_PER_BATCH = 500;

/** I11 — the only technician identity Sporacle accepts is the stable pseudonym. */
export const TECHNICIAN_PSEUDONYM_RE = /^tech_\d+$/;
/** Opaque-token cap for refs/ids/codes persisted from the wire. */
export const OPAQUE_REF_MAX_LENGTH = 200;

/**
 * B1 — event-type contract, mirrored from Veluma's mapper
 * (apps/api/app/services/delivery/guest_platform.py::_event_type):
 * canonical_type "customer" -> "profile.upsert"; every other canonical type X
 * -> "X.updated". The names "spa.booking.created" / "outlet.reservation.upsert"
 * exist only in Veluma's DEFAULT_EVENT_TYPES allowlist as reserved labels, so
 * BOTH spellings of each family are accepted and classified to one stored kind.
 */
export type VelumaEventKind = "profile" | "spa_booking" | "outlet_reservation" | "unknown";

const SPA_BOOKING_EVENT_TYPES = new Set(["spa_booking.updated", "spa.booking.created"]);
const OUTLET_RESERVATION_EVENT_TYPES = new Set(["outlet_reservation.updated", "outlet.reservation.upsert"]);

export function classifyEventType(eventType: string, canonicalType: string | null): VelumaEventKind {
  // I1 first and always: anything customer-canonical is a guest profile,
  // whatever its eventType claims to be. Profiles are skipped, never parsed.
  if (eventType === PROFILE_EVENT_TYPE || canonicalType === PROFILE_CANONICAL_TYPE) return "profile";
  if (SPA_BOOKING_EVENT_TYPES.has(eventType) || canonicalType === "spa_booking") return "spa_booking";
  if (OUTLET_RESERVATION_EVENT_TYPES.has(eventType) || canonicalType === "outlet_reservation") {
    return "outlet_reservation";
  }
  return "unknown";
}

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

/**
 * I1 value hardening: persisted refs/ids/codes are opaque machine tokens.
 * A value that looks like an email address or a phone number is rejected to
 * null rather than persisted — a column NAME check alone would happily store
 * source_ref="a@b.com". Overlong values are rejected to null too (free text
 * does not belong in a ref column).
 */
export function sanitizeOpaqueRef(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > OPAQUE_REF_MAX_LENGTH) return null;
  if (v.includes("@")) return null; // email-shaped
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 7 && /^\+?[\d\s\-().]+$/.test(v)) return null; // phone-shaped
  return v;
}

/** I11: technician identity persists only as the stable pseudonym, else null. */
export function sanitizeTechnicianRef(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return TECHNICIAN_PSEUDONYM_RE.test(v) ? v : null;
}

/* ---------- Zod schemas (all .strip(): unknown fields are dropped) ---------- */

/**
 * I1 two-stage parse — stage 1: classification only. This schema reads ONLY
 * eventType, canonical_type and idempotency_key; the payload/profile/envelope
 * objects of a record are not accessed at all. A record that classifies as
 * profile (or unknown) is acked skipped WITHOUT its payload ever being parsed.
 */
const slimRecordSchema = z
  .object({
    eventType: z.string().min(1).max(256),
    canonical_type: z.string().max(256).nullish().catch(null),
    idempotency_key: z.string().min(1).max(512),
  })
  .strip();

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
 * Keep-allowlist for spa_booking / outlet_reservation payloads (stage 2 —
 * reached only after stage-1 classification says this is a storable kind).
 * The payload shape is not yet pinned upstream, so this is default-deny:
 * only these operationally-safe keys are read; everything else — including any
 * PII field the contract spec names — is never accessed (`.strip()` reads only
 * declared keys). OPTIONAL fields are tolerant (`catch`) so a malformed value
 * degrades to null (I5); the primary business identifier is checked after the
 * parse and a record without one is skipped as malformed (I4), never stored
 * as an all-null husk.
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

/** Stage 2 — full record parse. Only booking/reservation records reach this. */
const storedRecordSchema = z
  .object({
    eventType: z.string().min(1),
    canonical_type: z.string().nullish().catch(null),
    idempotency_key: z.string().min(1).max(512),
    source_ref: z.string().nullish().catch(null),
    payload: operationalPayloadSchema.nullish().catch(null),
    envelope: recordEnvelopeSchema.nullish().catch(null),
  })
  .strip();

const batchSchema = z
  .object({
    source: z.string().nullish().catch(null),
    contractVersion: z.string().min(1),
    property_id: z.string().nullish().catch(null),
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

/** Machine-readable skip reasons, persisted in the audit trail (counts only). */
export type SkipReason =
  | "profile_never_parsed"
  | "unknown_event_type"
  | "invalid_record"
  | "malformed_record"
  | "duplicate_record"
  | "property_mismatch"
  | "redelivery";

export type VelumaEventsResult =
  | {
      ok: true;
      ingestRunId: string;
      ack: VelumaEventsAck;
      byType: PerTypeCounts;
      skippedReasons: Partial<Record<SkipReason, number>>;
      redelivery: boolean;
      /** true when the outcome was established by a concurrent/prior delivery (Veluma treats 409 as duplicate-success) */
      duplicate: boolean;
    }
  | { ok: false; status: 400 | 413 | 500; error: string };

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

/** byType labels are drawn from this closed set — a hostile eventType string is never persisted in the audit log (I1). */
const KNOWN_TYPE_LABELS = new Set([
  PROFILE_EVENT_TYPE,
  ...SPA_BOOKING_EVENT_TYPES,
  ...OUTLET_RESERVATION_EVENT_TYPES,
]);

function typeLabel(eventType: string, kind: VelumaEventKind): string {
  if (kind === "profile") return PROFILE_EVENT_TYPE;
  if (kind === "unknown") return "unknown_event_type";
  return KNOWN_TYPE_LABELS.has(eventType) ? eventType : kind;
}

type ProcessOpts = {
  batchKey?: string | null;
  payloadSha256?: string | null;
  sentAt?: Date | null;
  /** Server-pinned property id (env VELUMA_PROPERTY_ID). null/undefined = no pin. */
  expectedPropertyId?: string | null;
};

// Drizzle transaction handle — same query surface as Db for our purposes.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function processVelumaEventsBatch(
  db: Db,
  rawBatch: unknown,
  opts: ProcessOpts = {},
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
  // I2 cap — see MAX_RECORDS_PER_BATCH doc comment for why 413 (retry ->
  // dead-letter with reason, records stay replayable) beats a silent 200 ack.
  if (batch.records.length > MAX_RECORDS_PER_BATCH) {
    return { ok: false, status: 413, error: `batch_too_large:${batch.records.length}>${MAX_RECORDS_PER_BATCH}` };
  }

  const batchKey = opts.batchKey?.trim() || null;
  const expectedPropertyId = opts.expectedPropertyId?.trim() || null;

  const attempt = () =>
    db.transaction(async (tx) => runBatch(tx, batch, { batchKey, expectedPropertyId, opts }));

  // B2 — a storage failure rolls the transaction back atomically (no half-written
  // veluma_event rows, no run row, delivery_id never occupied), so reprocessing
  // the same batch is safe and exact: record-level idempotency re-skips what a
  // prior attempt stored. A unique-violation can only mean a concurrent delivery
  // completed the same batch — that is a confirmed duplicate, acked as such.
  try {
    return await attempt();
  } catch {
    const dup = await findDuplicateSuccess(db, batchKey, batch.records.length);
    if (dup) return dup;
    try {
      return await attempt(); // single internal retry: safe + exact (see above)
    } catch {
      const dup2 = await findDuplicateSuccess(db, batchKey, batch.records.length);
      if (dup2) return dup2;
      // Genuine storage failure with a clean rollback: Veluma's retry/backoff is
      // the correct recovery. Never reached for a well-formed batch on a healthy DB.
      return { ok: false, status: 500, error: "storage_error" };
    }
  }
}

async function findDuplicateSuccess(
  db: Db,
  batchKey: string | null,
  recordCount: number,
): Promise<VelumaEventsResult | null> {
  if (!batchKey) return null;
  const prior = await db.select().from(ingestRun).where(eq(ingestRun.deliveryId, batchKey));
  const done = prior.find((r) => r.status === "success");
  if (!done) return null;
  return {
    ok: true,
    ingestRunId: done.id,
    ack: { applied: 0, merged: 0, skipped: recordCount },
    byType: { redelivery: { applied: 0, merged: 0, skipped: recordCount } },
    skippedReasons: { redelivery: recordCount },
    redelivery: true,
    duplicate: true,
  };
}

async function runBatch(
  tx: Tx,
  batch: z.infer<typeof batchSchema>,
  ctx: { batchKey: string | null; expectedPropertyId: string | null; opts: ProcessOpts },
): Promise<VelumaEventsResult> {
  const { batchKey, expectedPropertyId, opts } = ctx;
  const now = new Date();

  // Batch-level idempotency: a redelivered batch (same X-Veluma-Idempotency-Key)
  // that was already FULLY processed (status success — never a stuck "received"
  // row) is a noop acked as skipped, without reprocessing.
  let stuckRunId: string | null = null;
  if (batchKey) {
    const prior = await tx.select().from(ingestRun).where(eq(ingestRun.deliveryId, batchKey));
    const done = prior.find((r) => r.status === "success");
    if (done) {
      const runId = newId("run");
      const skippedAll = batch.records.length;
      await tx.insert(ingestRun).values({
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
        supersedesRunId: done.id,
        createdAt: now,
      });
      await tx.insert(auditEvent).values({
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
          skippedReasons: { redelivery: skippedAll },
        },
        at: now,
      });
      return {
        ok: true,
        ingestRunId: runId,
        ack: { applied: 0, merged: 0, skipped: skippedAll },
        byType: { redelivery: { applied: 0, merged: 0, skipped: skippedAll } },
        skippedReasons: { redelivery: skippedAll },
        redelivery: true,
        duplicate: false,
      };
    }
    // B2 — a non-success holder of this delivery key is the residue of a
    // crashed attempt (or of the pre-fix code). It never counts as delivered:
    // it is superseded here and the key is stamped on THIS run at success.
    const stuck = prior.find((r) => r.status !== "success");
    if (stuck) {
      stuckRunId = stuck.id;
      await tx
        .update(ingestRun)
        .set({ deliveryId: null, status: "failed", error: `superseded by retry of delivery ${batchKey}` })
        .where(eq(ingestRun.id, stuck.id));
    }
  }

  const runId = newId("run");
  // B2 — delivery_id is NOT written here. The run starts as "received" with a
  // null delivery_id and the key is stamped only in the same transaction that
  // flips it to "success": a crash can never leave the key occupied by a
  // half-processed run, so Veluma's retry is processed instead of 500ing.
  await tx.insert(ingestRun).values({
    id: runId,
    sourceId: VELUMA_EVENTS_SOURCE_ID,
    transport: VELUMA_EVENTS_TRANSPORT,
    deliveryId: null,
    feedKey: VELUMA_EVENTS_FEED_KEY,
    payloadSha256: opts.payloadSha256 ?? null,
    originPulledAt: opts.sentAt ?? null,
    deliveredAt: now,
    rowCount: 0,
    status: "received",
    error: null,
    supersedesRunId: stuckRunId,
    createdAt: now,
  });

  const ack: VelumaEventsAck = { applied: 0, merged: 0, skipped: 0 };
  const byType: PerTypeCounts = {};
  const skippedReasons: Partial<Record<SkipReason, number>> = {};
  const skip = (reason: SkipReason, label: string) => {
    ack.skipped += 1;
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
    bump(byType, label, "skipped");
  };

  // I13/I2 — property pin: the batch-level property_id must match the
  // server-pinned value when both are present; mismatches are acked skipped
  // and audited, never stored.
  const batchPropertyMismatch = Boolean(
    expectedPropertyId && batch.property_id && batch.property_id !== expectedPropertyId,
  );

  for (const rawRecord of batch.records) {
    // Stage 1 (I1): classify from the slim schema only — the payload object of
    // this record has not been parsed or touched at this point.
    const slim = slimRecordSchema.safeParse(rawRecord);
    if (!slim.success) {
      skip("invalid_record", "invalid_record");
      continue;
    }
    const kind = classifyEventType(slim.data.eventType, slim.data.canonical_type ?? null);
    const label = typeLabel(slim.data.eventType, kind);

    // I1: guest profile events are acknowledged and dropped. Their payload is
    // never parsed, never read, never stored, never logged — skipped by design.
    if (kind === "profile") {
      skip("profile_never_parsed", label);
      continue;
    }
    if (kind === "unknown") {
      skip("unknown_event_type", label);
      continue;
    }
    if (batchPropertyMismatch) {
      skip("property_mismatch", label);
      continue;
    }

    // Stage 2: only booking/reservation records get a payload parse, and the
    // parse is keep-allowlist only (default-deny, unknown keys never read).
    const rec = storedRecordSchema.safeParse(rawRecord);
    if (!rec.success) {
      skip("invalid_record", label);
      continue;
    }
    const record = rec.data;

    // Record-level property pin.
    const recordProperty = record.envelope?.property_id ?? null;
    if (expectedPropertyId && recordProperty && recordProperty !== expectedPropertyId) {
      skip("property_mismatch", label);
      continue;
    }

    // Record-level idempotency (contract §6 dedupe key).
    const existing = await tx
      .select({ id: velumaEvent.id })
      .from(velumaEvent)
      .where(eq(velumaEvent.idempotencyKey, record.idempotency_key));
    if (existing.length > 0) {
      skip("duplicate_record", label);
      continue;
    }

    const p = record.payload ?? {};
    // I4 — no null husks: a stored record must carry its primary business
    // identifier. Value-hardened first: an email/phone-shaped "id" is not an id.
    const bookingRef = sanitizeOpaqueRef(
      firstString(p.booking_id, p.bookingId, p.reservation_id, p.reservationId),
    );
    if (!bookingRef) {
      skip("malformed_record", label);
      continue;
    }

    // I6: date basis is explicit and fixed per stored kind (contract doc §8).
    const dateBasis = kind === "spa_booking" ? "booking_date" : "service_date";
    const cents = firstInt(p.value_cents, p.valueCents);

    const row = {
      id: newId("vev"),
      ingestRunId: runId,
      eventType: record.eventType, // verbatim wire name (I12); kind derives via classifyEventType
      canonicalType: sanitizeOpaqueRef(record.canonical_type ?? null),
      idempotencyKey: record.idempotency_key,
      // I1 value hardening: refs are opaque tokens — email/phone-shaped or
      // overlong values are rejected to null, never persisted.
      sourceRef: sanitizeOpaqueRef(record.source_ref ?? null),
      schemaVersion: sanitizeOpaqueRef(record.envelope?.schema_version ?? null),
      propertyRef: sanitizeOpaqueRef(recordProperty),
      lineageConnector: sanitizeOpaqueRef(record.envelope?.source_lineage?.connector ?? null),
      lineageRunId: sanitizeOpaqueRef(record.envelope?.source_lineage?.run_id ?? null),
      bookingRef,
      serviceCode: sanitizeOpaqueRef(firstString(p.service_code, p.serviceCode)),
      outletCode: sanitizeOpaqueRef(firstString(p.outlet_code, p.outletCode)),
      startAt: toTimestamp(firstString(p.start_at, p.startAt, p.start_time)),
      endAt: toTimestamp(firstString(p.end_at, p.endAt, p.end_time)),
      businessDate: firstString(p.business_date, p.businessDate),
      dateBasis,
      status: sanitizeOpaqueRef(p.status ?? null),
      partySize: firstInt(p.party_size, p.partySize, p.covers),
      // Money is integer cents; non-integer input already degraded to null above.
      valueCents: cents === null ? null : fromCents(cents).cents,
      channel: sanitizeOpaqueRef(firstString(p.channel, p.booking_channel)),
      // I11: only the stable pseudonym pattern persists; a real name never does.
      technicianRef: sanitizeTechnicianRef(firstString(p.technician_ref, p.technicianRef)),
      receivedAt: now,
    };
    assertNoPiiKeys(row); // I1 belt-and-braces
    await tx.insert(velumaEvent).values(row);
    ack.applied += 1;
    bump(byType, label, "applied");
  }

  // B2 — terminal success is the ONLY writer of delivery_id, in the same
  // transaction as every record insert: either everything lands, or nothing does.
  await tx
    .update(ingestRun)
    .set({ rowCount: ack.applied, status: "success", deliveryId: batchKey })
    .where(eq(ingestRun.id, runId));

  await tx
    .insert(feedAdapter)
    .values({ feedKey: VELUMA_EVENTS_FEED_KEY, status: "configured", lastDeliveryAt: now })
    .onConflictDoUpdate({
      target: feedAdapter.feedKey,
      set: { status: "configured", lastDeliveryAt: now },
    });

  // I4 audit trail: counts, reasons and ids only — never event content, and
  // never a wire-controlled string (byType labels come from a closed set).
  await tx.insert(auditEvent).values({
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
      skippedReasons,
      ...(skippedReasons.property_mismatch
        ? { expectedPropertyId, propertyPinViolations: skippedReasons.property_mismatch }
        : {}),
    },
    at: now,
  });

  return { ok: true, ingestRunId: runId, ack, byType, skippedReasons, redelivery: false, duplicate: false };
}

/* ---------- HTTP handler (route stays a thin wrapper) ---------- */

export type VelumaEventsHttpResult = { status: number; body: Record<string, unknown> };

export async function handleVelumaEventsRequest(
  db: Db,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string | undefined,
  opts: { expectedPropertyId?: string | null } = {},
): Promise<VelumaEventsHttpResult> {
  // I2 body-size cap — before signature work so an oversized body is never hashed.
  if (rawBody.length > MAX_BODY_BYTES) {
    return { status: 413, body: { error: "body_too_large", maxBytes: MAX_BODY_BYTES } };
  }
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
    // Property pin comes from server env (I13) — default matches env default.
    expectedPropertyId: opts.expectedPropertyId === undefined ? "FSP" : opts.expectedPropertyId,
  });

  if (!result.ok) {
    return { status: result.status, body: { error: result.error } };
  }
  // Ack shape Veluma parses: `id` becomes target_ref, `ack` lands on lineage.
  // A duplicate confirmed via unique-violation is 409 — Veluma treats 409 as
  // duplicate-success (terminal), identical in effect to a 200 noop ack.
  return {
    status: result.duplicate ? 409 : 200,
    body: {
      id: result.ingestRunId,
      ack: { applied: result.ack.applied, merged: result.ack.merged, skipped: result.ack.skipped },
    },
  };
}
